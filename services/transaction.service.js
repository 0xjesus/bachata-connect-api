// services/transaction.service.js
import primate from '@thewebchimp/primate';
import JunoBitsoService from '#services/juno-bitso.service.js';
import { Prisma } from '@prisma/client';

class TransactionService {
	static async processJunoDeposit(payload) {
		const { id: externalTransactionId, amount, destination } = payload;
		const clabe = destination?.account_number;

		if(!externalTransactionId || !amount || !clabe) {
			throw new Error('Payload de webhook de Juno inválido.');
		}

		const user = await primate.prisma.user.findUnique({ where: { fundingClabe: clabe } });
		if(!user) {
			throw new Error(`Usuario para CLABE ${ clabe } no encontrado.`);
		}

		const transaction = await primate.prisma.transaction.create({
			data: {
				userId: user.id,
				type: 'DEPOSIT_JUNO',
				status: 'COMPLETED',
				amount: new Prisma.Decimal(amount),
				description: `Depósito SPEI de Juno`,
				metas: { junoPayload: payload },
			},
		});

		return transaction;
	}

	static async getUserBalance(userId) {
		const aggregation = await primate.prisma.transaction.aggregate({
			_sum: {
				amount: true,
			},
			where: {
				userId,
				status: 'COMPLETED',
			},
		});

		return aggregation._sum.amount || new Prisma.Decimal(0);
	}

	static async createHostPayout(eventId, triggeredByUserId) {
		console.log(`[PAYOUT] 🚀 Iniciando proceso de PAGO INTERNO para el evento: ${ eventId }`);

		return primate.prisma.$transaction(async (tx) => {
			const event = await tx.event.findUnique({
				where: { id: eventId },
				include: { host: true },
			});

			if(!event) {
				console.error('[PAYOUT] ❌ Error: Evento no encontrado.');
				throw new Error('Event not found.');
			}

			if(event.hostId !== triggeredByUserId) {
				console.error(`[PAYOUT] ❌ Error: Intento no autorizado por usuario ${ triggeredByUserId }.`);
				throw new Error('Unauthorized. Only the host can request a payout.');
			}

			const goalReached = new Prisma.Decimal(event.currentAmount).gte(event.targetAmount);

			console.log('[PAYOUT] ℹ️  Verificando condiciones para la transferencia interna...');
			console.log(`   - Estado Actual: ${ event.status }`);
			console.log(`   - ¿Meta alcanzada?: ${ goalReached }`);

			if(!goalReached) {
				console.error('[PAYOUT] ❌ Error: La meta de financiamiento no ha sido alcanzada.');
				throw new Error('Payout failed: Funding goal not met.');
			}

			if(event.status === 'FUNDING' && goalReached) {
				console.log('[PAYOUT] 🛠️  Actualizando estado de FUNDING a CONFIRMED...');
				await tx.event.update({
					where: { id: eventId },
					data: { status: 'CONFIRMED' },
				});
				console.log('[PAYOUT] ✅ Estado del evento actualizado a CONFIRMED.');
			} else if(event.status !== 'CONFIRMED') {
				console.error(`[PAYOUT] ❌ Error: El evento está en estado ${ event.status } y no se puede pagar.`);
				throw new Error(`Payouts are only for confirmed events. Current status: ${ event.status }`);
			}

			// --- INICIO DE LA CORRECCIÓN LÓGICA ---
			// Se elimina la llamada a Juno/Bitso. Esto ahora es una operación 100% interna.
			console.log('[PAYOUT] ℹ️  No se realizarán llamadas a APIs externas. Procesando como transferencia interna.');

			const feePercentage = event.hostFeePercentage || new Prisma.Decimal(0); // Para el ejemplo, la quitamos.
			const fee = new Prisma.Decimal(event.currentAmount).times(feePercentage.div(100));
			const payoutAmount = new Prisma.Decimal(event.currentAmount).minus(fee);
			console.log(`[PAYOUT] ℹ️  Cálculo del pago: Total ${ event.currentAmount } - Comisión ${ fee } = Pago de ${ payoutAmount.toFixed(2) }`);

			// Creamos la transacción que AUMENTA el balance del organizador.
			await tx.transaction.create({
				data: {
					userId: event.hostId,
					eventId: eventId,
					type: 'HOST_PAYOUT',
					status: 'COMPLETED',
					amount: payoutAmount, // El monto es POSITIVO para sumar al balance.
					description: `Recepción de fondos por evento exitoso: ${ event.title }`,
					metas: {
						totalCollected: event.currentAmount,
						fee,
						payoutAmount,
					},
				},
			});
			console.log('[PAYOUT] ✅ Transacción de PAGO creada en la base de datos local.');

			// Finalmente, marcamos el evento como completado.
			const completedEvent = await tx.event.update({
				where: { id: eventId },
				data: { status: 'COMPLETED' },
			});
			console.log('[PAYOUT] ✅ Evento marcado como COMPLETADO.');

			return completedEvent;
			// --- FIN DE LA CORRECCIÓN LÓGICA ---
		});
	}

	static async createMassRefund(eventId, tx) {
		const participations = await tx.participation.findMany({
			where: { eventId },
			include: { user: true, event: true },
		});

		for(const p of participations) {
			await tx.transaction.create({
				data: {
					userId: p.userId,
					eventId: eventId,
					type: 'EVENT_REFUND',
					status: 'COMPLETED',
					amount: new Prisma.Decimal(p.amount),
					description: `Reembolso por evento cancelado: ${ p.event.title }`,
					metas: { participationId: p.id },
				},
			});
		}
	}

	static async getUserTransactionHistory(userId, options = {}) {
		const { limit = 10, offset = 0 } = options;
		const transactions = await primate.prisma.transaction.findMany({
			where: { userId },
			take: parseInt(limit),
			skip: parseInt(offset),
			orderBy: { created: 'desc' },
			include: { event: true },
		});
		const total = await primate.prisma.transaction.count({ where: { userId } });
		return {
			data: transactions,
			meta: {
				total,
				limit: parseInt(limit),
				offset: parseInt(offset),
				hasMore: (parseInt(offset) + parseInt(limit)) < total,
			},
		};
	}

	static async getUserFinancialStats(userId) {
		const transactions = await primate.prisma.transaction.findMany({
			where: { userId, status: 'COMPLETED' },
		});

		const totalDeposited = transactions
			.filter(t => t.type === 'DEPOSIT_JUNO')
			.reduce((sum, t) => sum.plus(t.amount), new Prisma.Decimal(0));

		const totalWithdrawn = transactions
			.filter(t => t.type === 'WITHDRAWAL_CRYPTO' || t.type === 'HOST_PAYOUT')
			.reduce((sum, t) => sum.plus(t.amount.abs()), new Prisma.Decimal(0));

		const lastTransaction = transactions.length > 0 ? transactions[0].created : null;

		return {
			success: true,
			data: {
				totalTransactions: transactions.length,
				totalDeposited: totalDeposited.toFixed(2),
				totalWithdrawn: totalWithdrawn.toFixed(2),
				lastTransaction,
			},
		};
	}
}

export default TransactionService;
