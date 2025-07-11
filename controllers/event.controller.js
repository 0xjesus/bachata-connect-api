// entities/events/event.controller.js

import EventService from '../services/event.service.js';
import UploadService from '#services/upload.service.js';
import TransactionService from '#services/transaction.service.js';

class EventController {

	static async updateStatus(req, res) {
		try {
			const userId = req.user.payload.id;
			const { id } = req.params;
			const { status } = req.body;

			if(!status) {
				return res.respond({ status: 400, message: 'New status is required.' });
			}

			const updatedEvent = await EventService.updateStatus(id, userId, status);
			return res.respond({ data: updatedEvent, message: `Event status successfully updated to ${ status }` });
		} catch(error) {
			console.error(`[CONTROLLER] Error en updateStatus:`, error);
			const statusCode = error.message.includes('Unauthorized') ? 403 : 400;
			return res.respond({ status: statusCode, message: error.message });
		}
	}

	static async listMyEvents(req, res) {
		try {
			const userId = req.user.payload.id;
			console.log(`[CONTROLLER] Petición para listar eventos de ${ userId }`);
			const events = await EventService.listByHost(userId);
			return res.respond({ data: events });
		} catch(error) {
			console.error('[CONTROLLER] Error en listMyEvents:', error);
			return res.respond({ status: 500, message: 'Error listing your events: ' + error.message });
		}
	}

	static async create(req, res) {
		try {
			const userId = req.user.payload.id;
			const event = await EventService.create(req.body, userId);
			return res.respond({ status: 201, data: event, message: 'Event created successfully.' });
		} catch(error) {
			return res.respond({ status: 500, message: 'Error creating event: ' + error.message });
		}
	}

	static async getPublicBySlug(req, res) {
		try {
			const { slug } = req.params;
			const event = await EventService.findBySlug(slug);
			if(!event) {
				return res.respond({ status: 404, message: 'Event not found.' });
			}
			return res.respond({ data: event });
		} catch(error) {
			return res.respond({ status: 500, message: 'Error retrieving event: ' + error.message });
		}
	}

	static async listPublic(req, res) {
		try {
			const events = await EventService.listPublic();
			return res.respond({ data: events });
		} catch(error) {
			return res.respond({ status: 500, message: 'Error listing events: ' + error.message });
		}
	}

	static async join(req, res) {
		try {
			const userId = req.user.payload.id;
			const { eventId } = req.params;
			const { amount } = req.body;

			if(!amount || amount <= 0) {
				return res.respond({ status: 400, message: 'A valid amount is required to join.' });
			}

			const event = await EventService.join(eventId, userId, parseFloat(amount));
			return res.respond({ data: event, message: 'Successfully joined event!' });
		} catch(error) {
			return res.respond({ status: 400, message: 'Could not join event: ' + error.message });
		}
	}

	static async update(req, res) {
		try {
			const userId = req.user.payload.id;
			const { id } = req.params;
			const updatedEvent = await EventService.update(id, userId, req.body);
			return res.respond({ data: updatedEvent, message: 'Event updated successfully.' });
		} catch(error) {
			const statusCode = error.message.includes('Unauthorized') ? 403 : 400;
			return res.respond({ status: statusCode, message: 'Error updating event: ' + error.message });
		}
	}

	static async cancel(req, res) {
		try {
			const userId = req.user.payload.id;
			const { id } = req.params;
			const cancelledEvent = await EventService.cancel(id, userId);
			return res.respond({ data: cancelledEvent, message: 'Event cancelled successfully.' });
		} catch(error) {
			const statusCode = error.message.includes('Unauthorized') ? 403 : 400;
			return res.respond({ status: statusCode, message: 'Error cancelling event: ' + error.message });
		}
	}

	/**
	 * Handles the upload and assignment of a cover image for an event.
	 */
	static async uploadCoverImage(req, res) {
		try {
			const userId = req.user.payload.id;
			const { id: eventId } = req.params;

			if(!req.file) {
				return res.respond({ status: 400, message: 'No file received for cover image.' });
			}

			// 1. Upload the file and create an attachment record
			const attachment = await UploadService.createAttachment(req.file, {
				metas: { type: 'event-cover' },
			});

			// 2. Associate the new attachment with the event
			const updatedEvent = await EventService.setCoverImage(eventId, attachment.id, userId);

			return res.respond({
				data: updatedEvent,
				message: 'Cover image updated successfully.',
			});

		} catch(error) {
			const statusCode = error.message.includes('Unauthorized') ? 403 : 400;
			return res.respond({ status: statusCode, message: 'Error uploading cover image: ' + error.message });
		}
	}

	static async payout(req, res) {
		try {
			const userId = req.user.payload.id;
			const { eventId } = req.params;
			const completedEvent = await TransactionService.createHostPayout(eventId, userId);
			return res.respond({
				data: completedEvent,
				message: 'Payout successfully processed. Event is now completed.',
			});
		} catch(error) {
			const statusCode = error.message.includes('Unauthorized') ? 403 : 400;
			return res.respond({ status: statusCode, message: error.message });
		}
	}

	static async simulateDonations(req, res) {
		try {
			const userId = req.user.payload.id;
			const { eventId } = req.params;
			const result = await EventService.simulateDonations(eventId, userId);
			return res.respond({ message: result.message });
		} catch(error) {
			const statusCode = error.message.includes('Unauthorized') ? 403 : 400;
			return res.respond({ status: statusCode, message: 'Error simulating donations: ' + error.message });
		}
	}

	static async simulateRefund(req, res) {
		try {
			const userId = req.user.payload.id;
			const { eventId } = req.params;
			await EventService.forceRefund(eventId, userId);
			return res.respond({ message: 'Event has been cancelled and refunds initiated.' });
		} catch(error) {
			const statusCode = error.message.includes('Unauthorized') ? 403 : 400;
			return res.respond({ status: statusCode, message: 'Error simulating refund: ' + error.message });
		}
	}

	static async simulatePayout(req, res) {
		try {
			const userId = req.user.payload.id;
			const { eventId } = req.params;
			const result = await EventService.simulatePayout(eventId, userId);
			return res.respond({ data: result, message: 'Payout simulation successful.' });
		} catch(error) {
			const statusCode = error.message.includes('Unauthorized') ? 403 : 400;
			return res.respond({ status: statusCode, message: 'Error simulating payout: ' + error.message });
		}
	}

	// controllers/event.controller.js - AGREGAR ESTE MÉTODO

	// Agregar después del método simulateRefund, antes del export

	static async simulateDeadline(req, res) {
		try {
			const userId = req.user.payload.id;
			const { eventId } = req.params;

			const result = await EventService.simulateDeadlineReached(eventId, userId);

			return res.respond({
				data: result,
				message: result.message,
			});
		} catch(error) {
			const statusCode = error.message.includes('Unauthorized') ? 403 : 400;
			return res.respond({
				status: statusCode,
				message: 'Error simulating deadline: ' + error.message,
			});
		}
	}
}

export default EventController;
