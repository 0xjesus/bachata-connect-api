// controllers/crypto-address.controller.js
import CryptoAddressService from '#services/crypto-address.service.js';

class CryptoAddressController {

    /**
     * Crea una nueva dirección crypto para el usuario autenticado
     */
    static async create(req, res) {
        try {
            const userId = req.user.payload.id;
            const addressData = req.body;

            const newAddress = await CryptoAddressService.createAddress(userId, addressData);

            return res.respond({
                status: 201,
                data: newAddress,
                message: 'Crypto address created successfully'
            });

        } catch (error) {
            const statusCode = error.message.includes('Invalid') || error.message.includes('already registered') ? 400 : 500;
            return res.respond({
                status: statusCode,
                message: 'Error creating crypto address: ' + error.message
            });
        }
    }

    /**
     * Lista todas las direcciones del usuario autenticado
     */
    static async list(req, res) {
        try {
            const userId = req.user.payload.id;

            const addresses = await CryptoAddressService.getUserAddresses(userId);

            return res.respond({
                data: addresses,
                message: 'Crypto addresses retrieved successfully'
            });

        } catch (error) {
            return res.respond({
                status: 500,
                message: 'Error retrieving crypto addresses: ' + error.message
            });
        }
    }

    /**
     * Actualiza una dirección existente
     */
    static async update(req, res) {
        try {
            const userId = req.user.payload.id;
            const { addressId } = req.params;
            const updateData = req.body;

            const updatedAddress = await CryptoAddressService.updateAddress(addressId, userId, updateData);

            return res.respond({
                data: updatedAddress,
                message: 'Crypto address updated successfully'
            });

        } catch (error) {
            const statusCode = error.message.includes('not found') ? 404 : 400;
            return res.respond({
                status: statusCode,
                message: 'Error updating crypto address: ' + error.message
            });
        }
    }

    /**
     * Elimina una dirección
     */
    static async delete(req, res) {
        try {
            const userId = req.user.payload.id;
            const { addressId } = req.params;

            await CryptoAddressService.deleteAddress(addressId, userId);

            return res.respond({
                message: 'Crypto address deleted successfully'
            });

        } catch (error) {
            const statusCode = error.message.includes('not found') ? 404 : 400;
            return res.respond({
                status: statusCode,
                message: 'Error deleting crypto address: ' + error.message
            });
        }
    }

    /**
     * Retira MXNB a una dirección crypto del usuario
     */
    static async withdrawMXNB(req, res) {
        try {
            const userId = req.user.payload.id;
            const withdrawalData = req.body;

            console.log(`🚀 [CryptoAddressController] MXNB withdrawal request from user ${userId}:`, withdrawalData);

            const result = await CryptoAddressService.withdrawMXNBToAddress(userId, withdrawalData);

            return res.respond({
                status: 201,
                data: result,
                message: result.message
            });

        } catch (error) {
            console.error(`❌ [CryptoAddressController] MXNB withdrawal failed for user ${req.user.payload.id}:`, error.message);

            let statusCode = 500;
            if (error.message.includes('not found') || error.message.includes('inactive')) {
                statusCode = 404;
            } else if (error.message.includes('Invalid') || error.message.includes('Insufficient') || error.message.includes('required')) {
                statusCode = 400;
            } else if (error.message.includes('Balance check failed') || error.message.includes('Juno')) {
                statusCode = 502;
            }

            return res.respond({
                status: statusCode,
                message: 'Error processing MXNB withdrawal: ' + error.message
            });
        }
    }

    /**
     * Lista el historial de retiros crypto del usuario
     */
    static async getWithdrawals(req, res) {
        try {
            const userId = req.user.payload.id;
            const { limit = 25, offset = 0 } = req.query;

            const result = await CryptoAddressService.getUserWithdrawals(userId, {
                limit: parseInt(limit),
                offset: parseInt(offset)
            });

            return res.respond({
                data: result.data,
                meta: result.meta,
                message: 'Crypto withdrawals retrieved successfully'
            });

        } catch (error) {
            return res.respond({
                status: 500,
                message: 'Error retrieving crypto withdrawals: ' + error.message
            });
        }
    }

    /**
     * Obtiene los detalles de un retiro específico
     */
    static async getWithdrawalDetails(req, res) {
        try {
            const userId = req.user.payload.id;
            const { withdrawalId } = req.params;

            const withdrawal = await CryptoAddressService.getWithdrawalDetails(withdrawalId, userId);

            return res.respond({
                data: withdrawal,
                message: 'Withdrawal details retrieved successfully'
            });

        } catch (error) {
            const statusCode = error.message.includes('not found') ? 404 : 500;
            return res.respond({
                status: statusCode,
                message: 'Error retrieving withdrawal details: ' + error.message
            });
        }
    }

    /**
     * Endpoint de prueba para retiro directo (como tu ejemplo)
     */
    static async testWithdrawal(req, res) {
        try {
            const userId = req.user.payload.id;
            const { address, amount, blockchain = 'ARBITRUM' } = req.body;

            console.log(`🧪 [CryptoAddressController] Test withdrawal for user ${userId}:`, { address, amount, blockchain });

            // Validaciones básicas
            if (!address || !amount) {
                return res.respond({
                    status: 400,
                    message: 'Address and amount are required'
                });
            }

            // Validar dirección Ethereum
            if (!CryptoAddressService.validateEthereumAddress(address)) {
                return res.respond({
                    status: 400,
                    message: 'Invalid Ethereum address format'
                });
            }

            // Crear dirección temporal si no existe
            let cryptoAddress;
            try {
                cryptoAddress = await CryptoAddressService.createAddress(userId, {
                    address,
                    blockchain,
                    label: 'Test Withdrawal Address'
                });
            } catch (error) {
                // Si ya existe, buscarla
                if (error.message.includes('already registered')) {
                    const addresses = await CryptoAddressService.getUserAddresses(userId);
                    cryptoAddress = addresses.find(addr => addr.address.toLowerCase() === address.toLowerCase());
                } else {
                    throw error;
                }
            }

            // Realizar el retiro
            const result = await CryptoAddressService.withdrawMXNBToAddress(userId, {
                addressId: cryptoAddress.id,
                amount,
                blockchain
            });

            return res.respond({
                status: 201,
                data: result,
                message: `Test withdrawal of ${amount} MXNB to ${address} initiated successfully`
            });

        } catch (error) {
            console.error(`❌ [CryptoAddressController] Test withdrawal failed:`, error.message);

            return res.respond({
                status: 500,
                message: 'Test withdrawal failed: ' + error.message
            });
        }
    }
}

export default CryptoAddressController;
