// controllers/update-comment.controller.js
import UpdateCommentService from '#services/update-comment.service.js';

class UpdateCommentController {

    static async create(req, res) {
        try {
            const authorId = req.user.payload.id;
            const { updateId } = req.params;
            const { content } = req.body;
            const comment = await UpdateCommentService.create(updateId, authorId, content);
            return res.respond({ status: 201, data: comment, message: 'Comment posted.' });
        } catch (error) {
            return res.respond({ status: 400, message: error.message });
        }
    }

    static async listByUpdate(req, res) {
        try {
            const { updateId } = req.params;
            const comments = await UpdateCommentService.listByUpdate(updateId);
            return res.respond({ data: comments });
        } catch (error) {
            return res.respond({ status: 500, message: error.message });
        }
    }

    static async delete(req, res) {
        try {
            const userId = req.user.payload.id;
            const { commentId } = req.params;
            await UpdateCommentService.delete(commentId, userId);
            return res.respond({ message: 'Comment deleted.' });
        } catch (error) {
            const statusCode = error.message.includes("Unauthorized") ? 403 : 400;
            return res.respond({ status: statusCode, message: error.message });
        }
    }
}

export default UpdateCommentController;
