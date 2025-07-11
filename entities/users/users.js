import { auth, Primate } from '@thewebchimp/primate';
import UserController from './user.controller.js';
import multer from 'multer';

const router = Primate.getRouter();
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// me (rutas del usuario autenticado)
router.get('/me', auth, UserController.me);

// --- RUTA NUEVA ---
// why: Crucial endpoint for the frontend to get the user's available funds.
router.get('/me/balance', auth, UserController.getBalance);
// --- FIN DE RUTA NUEVA ---


// register a new user
router.post('/register', UserController.register);

// login
router.post('/login', UserController.login);

// get user avatar
router.get('/:id/avatar', UserController.avatar);

// update user avatar
router.put('/:id/avatar', auth, upload.single('file'), UserController.updateAvatar);

// Recover account
router.post('/recover', UserController.recoverAccount);
router.post('/recover/validate', UserController.validateRecoveryToken);
router.get('/me/transactions', auth, UserController.getTransactions);

// Obtener estadísticas del usuario autenticado
router.get('/me/stats', auth, UserController.getStats);

router.get('/me/activity', auth, UserController.getActivitySummary);
router.post('/me/wallet', auth, UserController.generateUserWallet);
router.get('/me/wallet/private-key', auth, UserController.getWalletPrivateKey);

Primate.setupRoute('user', router, {
    searchField: [ 'username' ],
    queryableFields: [ 'nicename', 'email' ],
});

export { router };
