// routes/update-comment.js
import { auth, Primate } from '@thewebchimp/primate';
import UpdateCommentController from '#controllers/update-comment.controller.js';

const router = Primate.getRouter();

// Crear un comentario en un "update" específico
router.post('/updates/:updateId/comments', auth, UpdateCommentController.create);
// Listar todos los comentarios de un "update"
router.get('/updates/:updateId/comments', UpdateCommentController.listByUpdate);
// Borrar un comentario específico
router.delete('/comments/:commentId', auth, UpdateCommentController.delete);

export { router };
