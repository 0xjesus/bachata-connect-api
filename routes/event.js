// entities/events/event.routes.js

import { auth, Primate } from '@thewebchimp/primate';
import EventController from '../controllers/event.controller.js';
import multer from 'multer'; // Importa multer que ya usas

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const router = Primate.getRouter();

// --- Rutas Públicas (no requieren autenticación) ---
router.get('/public', EventController.listPublic);
router.get('/:slug/public', EventController.getPublicBySlug);

// --- Rutas Privadas (requieren autenticación) ---
router.post('/', auth, EventController.create);
router.post('/:eventId/join', auth, EventController.join);
router.get('/my-events', auth, EventController.listMyEvents);
router.put('/:id/status', auth, EventController.updateStatus);

// Endpoints para editar y cancelar, solo el host puede hacerlo.
router.put('/:id', auth, EventController.update);
router.delete('/:id', auth, EventController.cancel);
router.put('/:id/cover', auth, upload.single('file'), EventController.uploadCoverImage);
router.post('/:eventId/payout', auth, EventController.payout);
router.post('/:eventId/simulate-donations', auth, EventController.simulateDonations);
router.post('/:eventId/simulate-refund', auth, EventController.simulateRefund);
router.post('/:eventId/simulate-deadline', auth, EventController.simulateDeadline);
export { router };
