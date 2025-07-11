// entities/event-updates/event-update.controller.js

import EventUpdateService from '../services/event-update.service.js';

class EventUpdateController {

    static async create(req, res) {
        try {
            const authorId = req.user.payload.id;
            const { eventId } = req.params;
            const { content } = req.body;

            if (!content) {
                return res.respond({ status: 400, message: 'Content is required for an update.' });
            }

            const update = await EventUpdateService.create(eventId, authorId, content);
            return res.respond({ status: 201, data: update, message: 'Update posted successfully.' });
        } catch (error) {
            const statusCode = error.message.includes("Unauthorized") ? 403 : 400;
            return res.respond({ status: statusCode, message: 'Error posting update: ' + error.message });
        }
    }

    static async listByEvent(req, res) {
        try {
            const { eventId } = req.params;
            const updates = await EventUpdateService.listByEvent(eventId);
            return res.respond({ data: updates });
        } catch (error) {
            return res.respond({ status: 500, message: 'Error fetching updates: ' + error.message });
        }
    }

    static async update(req, res) {
        try {
            const userId = req.user.payload.id;
            const { updateId } = req.params;
            const { content } = req.body;

            if (!content) {
                return res.respond({ status: 400, message: 'Content is required.' });
            }

            const updatedPost = await EventUpdateService.update(updateId, userId, content);
            return res.respond({ data: updatedPost, message: 'Update edited successfully.' });
        } catch (error) {
            const statusCode = error.message.includes("Unauthorized") ? 403 : 400;
            return res.respond({ status: statusCode, message: 'Error updating post: ' + error.message });
        }
    }

    static async delete(req, res) {
        try {
            const userId = req.user.payload.id;
            const { updateId } = req.params;
            await EventUpdateService.delete(updateId, userId);
            return res.respond({ message: 'Update deleted successfully.' });
        } catch (error) {
            const statusCode = error.message.includes("Unauthorized") ? 403 : 400;
            return res.respond({ status: statusCode, message: 'Error deleting update: ' + error.message });
        }
    }
}

export default EventUpdateController;
