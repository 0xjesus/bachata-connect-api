// services/update-comment.service.js
import primate from '@thewebchimp/primate';

class UpdateCommentService {

    static async create(updateId, authorId, content) {
        const update = await primate.prisma.eventUpdate.findUnique({ where: { id: updateId } });
        if (!update) {
            throw new Error("Update post not found.");
        }
        return primate.prisma.updateComment.create({
            data: { updateId, authorId, content }
        });
    }

    static async listByUpdate(updateId) {
        return primate.prisma.updateComment.findMany({
            where: { updateId },
            include: { author: { select: { id: true, nicename: true, metas: true } } },
            orderBy: { created: 'asc' }
        });
    }

    static async delete(commentId, userId) {
        const comment = await primate.prisma.updateComment.findUnique({
            where: { id: commentId },
            include: { update: { include: { event: true } } }
        });

        if (!comment) throw new Error("Comment not found.");

        const isAuthor = comment.authorId === userId;
        const isHost = comment.update.event.hostId === userId;

        if (!isAuthor && !isHost) {
            throw new Error("Unauthorized to delete this comment.");
        }

        return primate.prisma.updateComment.delete({ where: { id: commentId } });
    }
}

export default UpdateCommentService;
