// services/transaction.service.js
import primate from '@thewebchimp/primate';
import JunoBitsoService from '#services/juno-bitso.service.js';
import { Prisma } from '@prisma/client';

class TransactionService {
    static async processJunoDeposit(payload) {
        const { id: externalTransactionId, amount, destination } = payload;
        const clabe = destination?.account_number;

        if (!externalTransactionId || !amount || !clabe) {
            throw new Error('Payload de webhook de Juno inválido.');
        }

        const user = await primate.prisma.user.findUnique({ where: { fundingClabe: clabe } });
        if (!user) {
            throw new Error(`Usuario para CLABE ${clabe} no encontrado.`);
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
        return primate.prisma.$transaction(async (tx) => {
            const event = await tx.event.findUnique({
                where: { id: eventId },
                include: { host: true },
            });

            if(!event) throw new Error('Event not found.');
            if(event.hostId !== triggeredByUserId) throw new Error('Unauthorized. Only the host can request a payout.');
            if(event.status !== 'CONFIRMED') throw new Error('Payouts are only for confirmed events that have reached their goal.');

            const hostPayoutAddress = event.host.metas?.payoutAddress;
            if(!hostPayoutAddress) {
                throw new Error('Host has not configured their payout address.');
            }

            const feePercentage = event.hostFeePercentage || new Prisma.Decimal(5);
            const fee = new Prisma.Decimal(event.currentAmount).times(feePercentage.div(100));
            const payoutAmount = new Prisma.Decimal(event.currentAmount).minus(fee);

            const withdrawalResponse = await JunoBitsoService.createJunoWithdrawal({
                amount: payoutAmount.toFixed(2),
                asset: 'MXNB',
                blockchain: 'ARBITRUM',
                address: hostPayoutAddress
            });

            if(!withdrawalResponse.success) {
                throw new Error(`Juno withdrawal for payout failed: ${ withdrawalResponse.error?.message || 'Unknown error' }`);
            }

            await tx.transaction.create({
                data: {
                    userId: event.hostId,
                    eventId: eventId,
                    type: 'HOST_PAYOUT',
                    status: 'COMPLETED',
                    amount: payoutAmount,
                    description: `Recepción de fondos por evento: ${ event.title }`,
                    metas: { junoWithdrawalResponse: withdrawalResponse.payload },
                },
            });

            return await tx.event.update({
                where: { id: eventId },
                data: { status: 'COMPLETED' },
            });
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
