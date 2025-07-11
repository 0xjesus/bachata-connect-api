// routes/crypto-address.js
import { auth, Primate } from '@thewebchimp/primate';
import CryptoAddressController from '#controllers/crypto-address.controller.js';

const router = Primate.getRouter();

// --- Gestión de direcciones crypto ---
router.post('/addresses', auth, CryptoAddressController.create);
router.get('/addresses', auth, CryptoAddressController.list);
router.put('/addresses/:addressId', auth, CryptoAddressController.update);
router.delete('/addresses/:addressId', auth, CryptoAddressController.delete);

// --- Retiros crypto ---
router.post('/withdraw', auth, CryptoAddressController.withdrawMXNB);
router.get('/withdrawals', auth, CryptoAddressController.getWithdrawals);
router.get('/withdrawals/:withdrawalId', auth, CryptoAddressController.getWithdrawalDetails);

// --- Endpoint de prueba (como tu ejemplo) ---
router.post('/test-withdrawal', auth, CryptoAddressController.testWithdrawal);

export { router };
