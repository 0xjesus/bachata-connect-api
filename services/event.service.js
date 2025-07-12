// services/event.service.js
import primate from '@thewebchimp/primate';
import TransactionService from '#services/transaction.service.js';
import { Prisma } from '@prisma/client';

function slugify(text) {
	return text.toString().toLowerCase()
		.replace(/\s+/g, '-')
		.replace(/[^\w\-]+/g, '')
		.replace(/\-\-+/g, '-')
		.replace(/^-+/, '')
		.replace(/-+$/, '')
		.concat(`-${ Date.now().toString().slice(-6) }`);
}

class EventService {
	// services/event.service.js

	// services/event.service.js

static async join(eventId, userId, amount) {
   console.log(`[JOIN EVENT] 🚀 Inicio de proceso para Evento: ${eventId}, Usuario: ${userId}, Monto: ${amount}`);
   const amountDecimal = new Prisma.Decimal(amount);

   try {
       return await primate.prisma.$transaction(async (tx) => {
           // 1. Verificar balance del usuario
           console.log(`[JOIN EVENT] ℹ️  Paso 1: Verificando balance para usuario ${userId}...`);
           const currentBalance = await TransactionService.getUserBalance(userId, tx);
           console.log(`[JOIN EVENT] ℹ️  Balance actual: ${currentBalance.toFixed(2)} MXNB. Monto requerido: ${amountDecimal.toFixed(2)} MXNB.`);

           if(currentBalance.lessThan(amountDecimal)) {
               console.error(`[JOIN EVENT] ❌ ERROR: Saldo insuficiente para ${userId}.`);
               throw new Error(`Saldo insuficiente. Tienes ${currentBalance.toFixed(2)} MXNB.`);
           }
           console.log(`[JOIN EVENT] ✅ Balance suficiente.`);

           // 2. Obtener y validar el evento
           console.log(`[JOIN EVENT] ℹ️  Paso 2: Buscando evento ${eventId}...`);
           const event = await tx.event.findUnique({ where: { id: eventId } });

           if(!event) {
               console.error(`[JOIN EVENT] ❌ ERROR: Evento con ID ${eventId} no encontrado.`);
               throw new Error('Event not found.');
           }
           console.log(`[JOIN EVENT] ✅ Evento encontrado: "${event.title}".`);

           // 3. Validar estado del evento
           console.log(`[JOIN EVENT] ℹ️  Paso 3: Verificando estado del evento. Estado actual: ${event.status}`);
           if(event.status !== 'FUNDING') {
               console.error(`[JOIN EVENT] ❌ ERROR: El evento no está en estado 'FUNDING'.`);
               throw new Error('Este evento no está aceptando participantes.');
           }
           console.log(`[JOIN EVENT] ✅ El evento está abierto para recibir fondos.`);

           // 4. Validar que el organizador no se una a su propio evento
           console.log(`[JOIN EVENT] ℹ️  Paso 4: Verificando que el usuario no sea el organizador.`);
           console.log(`[JOIN EVENT] ℹ️  Host ID: ${event.hostId}, User ID: ${userId}`);
           if(event.hostId === userId) {
               console.error(`[JOIN EVENT] ❌ ERROR: El usuario ${userId} es el organizador del evento.`);
               throw new Error('No puedes aportar a tu propio evento.');
           }
           console.log(`[JOIN EVENT] ✅ El usuario no es el organizador.`);

           // 5. Validar que el usuario no se haya unido previamente
           console.log(`[JOIN EVENT] ℹ️  Paso 5: Verificando si el usuario ya participa...`);
           const existingParticipation = await tx.participation.findUnique({
               where: { userId_eventId: { userId, eventId } },
           });
           if(existingParticipation) {
               console.error(`[JOIN EVENT] ❌ ERROR: El usuario ${userId} ya participa en este evento.`);
               throw new Error('Ya estás participando en este evento');
           }
           console.log(`[JOIN EVENT] ✅ El usuario no ha participado previamente.`);

           // 6. Crear la participación y la transacción
           console.log(`[JOIN EVENT] ℹ️  Paso 6: Creando registros de participación y transacción...`);
           const participation = await tx.participation.create({
               data: { amount: amountDecimal, userId, eventId },
           });
           console.log(`[JOIN EVENT] ✅ Participación creada con ID: ${participation.id}`);

           console.log(`[JOIN EVENT] 💸 Creando transacción NEGATIVA de: ${amountDecimal.negated()}`);

           const contributionTransaction = await tx.transaction.create({
               data: {
                   userId,
                   eventId,
                   type: 'EVENT_CONTRIBUTION',
                   status: 'COMPLETED',
                   amount: amountDecimal.negated(),
                   description: `Aportación al evento: ${event.title}`,
                   metas: { participationId: participation.id },
               },
           });
           console.log(`[JOIN EVENT] ✅ Transacción de contribución creada con ID: ${contributionTransaction.id}`);
           console.log(`[JOIN EVENT] 📊 Monto registrado: ${contributionTransaction.amount}`);

           // Verificar balance después de la transacción
           const newBalance = await TransactionService.getUserBalance(userId, tx);
           console.log(`[JOIN EVENT] 📈 Nuevo balance calculado: ${newBalance.toFixed(2)} MXNB`);
           console.log(`[JOIN EVENT] 🔍 Diferencia esperada: ${currentBalance.minus(amountDecimal).toFixed(2)} vs Real: ${newBalance.toFixed(2)}`);

           // 7. Actualizar el monto del evento
           console.log(`[JOIN EVENT] ℹ️  Paso 7: Actualizando monto total del evento...`);
           const updatedEvent = await tx.event.update({
               where: { id: eventId },
               data: { currentAmount: { increment: amountDecimal } },
           });
           console.log(`[JOIN EVENT] ✅ Monto del evento actualizado a: ${updatedEvent.currentAmount}`);

           // 8. Verificar si se alcanzó la meta (CON LA CORRECCIÓN)
           // why: Se añade "event.goalAmount &&" para evitar el error si la meta no está definida.
           if(event.goalAmount && updatedEvent.currentAmount.gte(event.goalAmount)) {
               console.log(`[JOIN EVENT] ℹ️  Paso 8: ¡META ALCANZADA! Actualizando estado a 'CONFIRMED'.`);
               await tx.event.update({
                   where: { id: eventId },
                   data: { status: 'CONFIRMED' },
               });
               console.log(`[JOIN EVENT] ✅ Estado del evento actualizado a 'CONFIRMED'.`);
           } else {
               console.log(`[JOIN EVENT] ℹ️  Paso 8: La meta aún no se ha alcanzado. Meta: ${event.goalAmount}, Actual: ${updatedEvent.currentAmount}`);
           }

           console.log(`[JOIN EVENT] 🎉 Proceso finalizado con éxito para el usuario ${userId}.`);
           return updatedEvent;
       });
   } catch(error) {
       console.error(`[JOIN EVENT] 🔥🔥🔥 TRANSACCIÓN FALLIDA: ${error.message}`);
       throw error; // Vuelve a lanzar el error para que el controlador lo capture
   }
}
	// services/event.service.js

	static async create(eventData, userId) {
		try {
			// --- INICIO DE LA CORRECCIÓN ---
			// Los inputs de tipo 'date' del HTML envían un string como "2025-07-30".
			// Prisma necesita un objeto Date de JavaScript para sus campos DateTime.
			// Aquí convertimos esos strings a objetos Date antes de enviarlos a la base de datos.
			if(eventData.fundingDeadline) {
				eventData.fundingDeadline = new Date(eventData.fundingDeadline);
			}
			if(eventData.eventDate) {
				eventData.eventDate = new Date(eventData.eventDate);
			}
			// --- FIN DE LA CORRECCIÓN ---

			eventData.hostId = userId;
			eventData.publicSlug = slugify(eventData.title);
			eventData.status = 'FUNDING';
			console.log('[CREATE EVENT] Creando evento con data procesada:', eventData);

			return await primate.prisma.event.create({ data: eventData });
		} catch(error) {
			// Este log te ayudará a ver cualquier otro error de Prisma en el futuro.
			console.error('[CREATE EVENT] Prisma Error:', error);
			throw error;
		}
	}

	static async findBySlug(slug) {
		return primate.prisma.event.findUnique({
			where: { publicSlug: slug },
			include: {
				host: { select: { id: true, nicename: true, metas: true } },
				participants: {
					select: {
						amount: true,
						user: { select: { id: true, nicename: true, metas: true } },
						created: true,
					},
				},
				updates: {
					orderBy: { created: 'desc' },
					include: {
						author: { select: { nicename: true, metas: true } },
						_count: { select: { comments: true } },
					},
				},
			},
		});
	}

	static async updateStatus(eventId, userId, newStatus) {
		console.log(`[SERVICE] Petición para cambiar estado del evento ${ eventId } a ${ newStatus } por usuario ${ userId }`);

		return primate.prisma.$transaction(async (tx) => {
			const event = await tx.event.findUnique({ where: { id: eventId } });

			if(!event) throw new Error('Event not found.');
			if(event.hostId !== userId) throw new Error('Unauthorized: Only the host can change the event status.');

			// Lógica de negocio para transiciones de estado
			if(event.status === 'COMPLETED' || event.status === 'CANCELLED') {
				throw new Error(`Cannot change status of an event that is already ${ event.status }.`);
			}
			if(newStatus === 'CANCELLED') {
				console.log(`[SERVICE] El evento ${ eventId } se está cancelando. Iniciando reembolsos...`);
				await TransactionService.createMassRefund(eventId, tx);
			}

			const updatedEvent = await tx.event.update({
				where: { id: eventId },
				data: { status: newStatus },
			});

			console.log(`[SERVICE] ✅ Estado del evento ${ eventId } cambiado a ${ newStatus }.`);
			return updatedEvent;
		});
	}

	static async listByHost(userId) {
		console.log(`[SERVICE] Buscando eventos para el host: ${ userId }`);
		return primate.prisma.event.findMany({
			where: { hostId: userId },
			include: {
				host: { select: { nicename: true } }, // Para que EventCard funcione
				_count: { // Contar participantes para la tarjeta
					select: { participants: true },
				},
			},
			orderBy: { created: 'desc' },
		});
	}

	static async listPublic() {
		return primate.prisma.event.findMany({
			where: { status: 'FUNDING' },
			include: { host: { select: { nicename: true } } },
			orderBy: { created: 'desc' },
		});
	}

	static async update(eventId, userId, dataToUpdate) {
		const event = await primate.prisma.event.findUnique({ where: { id: eventId } });
		if(!event || event.hostId !== userId) {
			throw new Error('Unauthorized or event not found.');
		}
		delete dataToUpdate.id;
		return primate.prisma.event.update({
			where: { id: eventId },
			data: dataToUpdate,
		});
	}

	static async cancel(eventId, userId) {
		return primate.prisma.$transaction(async (tx) => {
			const event = await tx.event.findUnique({ where: { id: eventId } });
			if(!event) throw new Error('Event not found.');
			if(event.hostId !== userId) throw new Error('Unauthorized.');
			if([ 'CANCELLED', 'COMPLETED' ].includes(event.status)) {
				throw new Error(`Cannot cancel an event that is already ${ event.status }.`);
			}
			await TransactionService.createMassRefund(eventId, tx);
			return tx.event.update({
				where: { id: eventId },
				data: { status: 'CANCELLED' },
			});
		});
	}

	static async setCoverImage(eventId, attachmentId, userId) {
		const event = await primate.prisma.event.findUnique({ where: { id: eventId } });
		if(!event || event.hostId !== userId) {
			throw new Error('Unauthorized or event not found.');
		}
		return primate.prisma.event.update({
			where: { id: eventId },
			data: { idCoverImage: attachmentId },
		});
	}

	// --- NUEVAS FUNCIONES DE SIMULACIÓN ---
	static async simulateDonations(eventId, hostId) {
		const event = await primate.prisma.event.findUnique({ where: { id: eventId } });
		if(!event || event.hostId !== hostId) {
			throw new Error('Unauthorized or Event not found.');
		}

		const mockDonors = await primate.prisma.user.findMany({
			where: {
				id: { not: hostId },
				transactions: { some: { amount: { gt: 100 } } },
			},
			take: 5,
		});

		if(mockDonors.length === 0) {
			throw new Error('No users with sufficient balance found to simulate donations.');
		}

		let totalDonated = 0;
		for(const donor of mockDonors) {
			const amount = Math.floor(Math.random() * 200) + 50;
			try {
				await this.join(eventId, donor.id, amount);
				totalDonated += amount;
			} catch(error) {
				console.warn(`Could not simulate donation for user ${ donor.id }: ${ error.message }`);
			}
		}
		return { message: `${ mockDonors.length } donations simulated for a total of ${ totalDonated } MXNB.` };
	}

	static async forceRefund(eventId, hostId) {
		return this.cancel(eventId, hostId);
	}

	// services/event.service.js

	static async simulateDeadlineReached(eventId, hostId) {
		return primate.prisma.$transaction(async (tx) => {
			const event = await tx.event.findUnique({
				where: { id: eventId },
				include: { participants: true },
			});

			if(!event || event.hostId !== hostId) {
				throw new Error('Unauthorized or Event not found.');
			}

			if(event.status !== 'FUNDING') {
				throw new Error('Can only simulate deadline for events in FUNDING status.');
			}

			console.log(`[SIMULATE DEADLINE] Processing deadline simulation for event ${ eventId }...`);

			const yesterday = new Date();
			yesterday.setDate(yesterday.getDate() - 1);

			// --- INICIO DE LA CORRECCIÓN ---
			// Se actualiza solo la fecha límite, ya que el campo 'metas' no existe en el modelo.
			await tx.event.update({
				where: { id: eventId },
				data: {
					fundingDeadline: yesterday,
				},
			});

			const updatedEvent = await tx.event.findUnique({ where: { id: eventId } });
			// --- FIN DE LA CORRECCIÓN ---

			const goalReached = updatedEvent.targetAmount && updatedEvent.currentAmount.gte(updatedEvent.targetAmount);

			if(goalReached) {
				const confirmedEvent = await tx.event.update({
					where: { id: eventId },
					data: { status: 'CONFIRMED' },
				});

				console.log(`[SIMULATE DEADLINE] ✅ Goal was reached! Event confirmed.`);
				return {
					event: confirmedEvent,
					result: 'goal_reached',
					message: `¡Meta alcanzada! El evento ha sido confirmado automáticamente.`,
				};

			} else {
				console.log(`[SIMULATE DEADLINE] ❌ Goal NOT reached. Cancelling and refunding...`);
				await TransactionService.createMassRefund(eventId, tx);

				const cancelledEvent = await tx.event.update({
					where: { id: eventId },
					data: { status: 'CANCELLED' },
				});

				console.log(`[SIMULATE DEADLINE] ✅ Event cancelled and refunds processed.`);
				return {
					event: cancelledEvent,
					result: 'goal_failed',
					message: `Deadline simulado. Meta no alcanzada (${ updatedEvent.currentAmount }/${ updatedEvent.targetAmount }). Evento cancelado y reembolsos procesados.`,
				};
			}
		});
	}
}

export default EventService;
