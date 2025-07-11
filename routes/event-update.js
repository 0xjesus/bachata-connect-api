// entities/event-updates/event-update.routes.js

import { auth, Primate } from '@thewebchimp/primate';
import EventUpdateController from '../controllers/event-update.controller.js';
// entities/event-updates/event-update.routes.js

const router = Primate.getRouter();

// --- Rutas anidadas bajo un evento ---
// Listar todos los updates de un evento específico
router.get('/events/:eventId/updates', EventUpdateController.listByEvent);
// Crear un nuevo update para un evento específico
router.post('/events/:eventId/updates', auth, EventUpdateController.create);

// --- Rutas para un update específico por su ID ---
// Editar un update
router.put('/updates/:updateId', auth, EventUpdateController.update);
// Eliminar un update
router.delete('/updates/:updateId', auth, EventUpdateController.delete);


export { router };
