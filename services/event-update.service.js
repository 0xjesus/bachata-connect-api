// entities/event-updates/event-update.service.js

import primate from '@thewebchimp/primate';

class EventUpdateService {

    /**
     * Creates a new update for an event.
     * @param {string} eventId - The ID of the event.
     * @param {string} authorId - The ID of the user posting the update.
     * @param {string} content - The content of the update post.
     * @returns {Promise<EventUpdate>}
     */
    static async create(eventId, authorId, content) {
        const event = await primate.prisma.event.findUnique({ where: { id: eventId } });
        if (!event) throw new Error("Event not found.");

        // why: Authorization check. Only the host or treasurers can post updates.
        const isTreasurer = await primate.prisma.eventTreasurer.findUnique({
            where: { userId_eventId: { userId: authorId, eventId } }
        });

        if (event.hostId !== authorId && !isTreasurer) {
            throw new Error("Unauthorized. Only the host or treasurers can post updates.");
        }

        return primate.prisma.eventUpdate.create({
            data: { eventId, authorId, content }
        });
    }

    /**
     * Lists all updates for a given event.
     * @param {string} eventId - The ID of the event.
     * @returns {Promise<EventUpdate[]>}
     */
    static async listByEvent(eventId) {
        return primate.prisma.eventUpdate.findMany({
            where: { eventId },
            include: {
                author: { select: { nicename: true, metas: true } },
                _count: { // Get a count of comments for each update
                    select: { comments: true }
                }
            },
            orderBy: { created: 'desc' }
        });
    }

    /**
     * Updates an existing event update.
     * @param {string} updateId - The ID of the update to edit.
     * @param {string} userId - The ID of the user making the request.
     * @param {string} content - The new content for the update.
     * @returns {Promise<EventUpdate>}
     */
    static async update(updateId, userId, content) {
        const eventUpdate = await primate.prisma.eventUpdate.findUnique({
            where: { id: updateId }
        });
        if (!eventUpdate) throw new Error("Update not found.");

        // why: Authorization check. Only the original author can edit their update.
        if (eventUpdate.authorId !== userId) {
            throw new Error("Unauthorized. You can only edit your own updates.");
        }

        return primate.prisma.eventUpdate.update({
            where: { id: updateId },
            data: { content },
        });
    }

    /**
     * Deletes an event update.
     * @param {string} updateId - The ID of the update to delete.
     * @param {string} userId - The ID of the user making the request.
     * @returns {Promise<EventUpdate>}
     */
    static async delete(updateId, userId) {
        const eventUpdate = await primate.prisma.eventUpdate.findUnique({
            where: { id: updateId },
            include: { event: true } // Include event to check for host
        });
        if (!eventUpdate) throw new Error("Update not found.");

        // why: Authorization check. The original author OR the event host can delete an update.
        const isAuthor = eventUpdate.authorId === userId;
        const isHost = eventUpdate.event.hostId === userId;

        if (!isAuthor && !isHost) {
            throw new Error("Unauthorized. You do not have permission to delete this update.");
        }

        // why: Use a transaction to ensure comments are deleted before the update itself.
        return primate.prisma.$transaction(async (tx) => {
            // First, delete all comments associated with this update.
            await tx.updateComment.deleteMany({
                where: { updateId: updateId }
            });

            // Then, delete the update itself.
            const deletedUpdate = await tx.eventUpdate.delete({
                where: { id: updateId }
            });

            return deletedUpdate;
        });
    }
}

export default EventUpdateService;
