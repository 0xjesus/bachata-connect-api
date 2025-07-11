// services/crypto-address.service.js
import primate from '@thewebchimp/primate';
import JunoBitsoService from '#services/juno-bitso.service.js';
import TransactionService from '#services/transaction.service.js';
import { ethers } from 'ethers';
import { Prisma } from '@prisma/client';

class CryptoAddressService {

	static validateEthereumAddress(address) {
		try {
			return ethers.utils.isAddress(address);
		} catch(error) {
			return false;
		}
	}

	static async createAddress(userId, addressData) {
		try {
			const { address, blockchain = 'ARBITRUM', label, isDefault = false } = addressData;

			if(!address || !label) {
				throw new Error('Address and Label are required');
			}

			if(!this.validateEthereumAddress(address)) {
				throw new Error('Invalid Ethereum address format');
			}

			const existingAddress = await primate.prisma.cryptoAddress.findFirst({
				where: { userId, address: address.toLowerCase() },
			});

			if(existingAddress) {
				// eliminala
				throw new Error('This address is already registered for your account');
			}

			if(isDefault) {
				await primate.prisma.cryptoAddress.updateMany({
					where: { userId },
					data: { isDefault: false },
				});
			}

			const newAddress = await primate.prisma.cryptoAddress.create({
				data: {
					userId,
					address: address.toLowerCase(),
					blockchain: blockchain.toUpperCase(),
					label: label || `${ blockchain } Address`,
					isDefault: isDefault || false,
					status: 'ACTIVE',
				},
			});
			return newAddress;
		} catch(error) {
			console.error('Error creating crypto address:', error);
			throw error;
		}
	}

	static async getUserAddresses(userId) {
		return primate.prisma.cryptoAddress.findMany({
			where: { userId, status: 'ACTIVE' },
			orderBy: [ { isDefault: 'desc' }, { created: 'desc' } ],
		});
	}

	static async deleteAddress(addressId, userId) {
		const address = await primate.prisma.cryptoAddress.findFirst({
			where: { id: addressId, userId },
		});

		if(!address) {
			throw new Error('Address not found or does not belong to user');
		}

		return primate.prisma.cryptoAddress.delete({
			where: { id: addressId },
		});
	}

	static async withdrawMXNBToAddress(userId, withdrawalData) {
		const { addressId, amount, blockchain = 'ARBITRUM' } = withdrawalData;

		// 1. Validaciones y Lecturas PREVIAS a la transacción
		if(!addressId || !amount) {
			throw new Error('Address ID and amount are required');
		}
		const amountDecimal = new Prisma.Decimal(amount);
		if(amountDecimal.lte(0)) {
			throw new Error('Invalid amount');
		}

		const user = await primate.prisma.user.findUnique({ where: { id: userId } });
		if(!user) throw new Error('User not found');

		const internalBalance = await TransactionService.getUserBalance(userId);
		if(internalBalance.lessThan(amountDecimal)) {
			throw new Error(`Insufficient internal balance. Available: ${ internalBalance.toFixed(2) } MXNB, Required: ${ amount } MXNB`);
		}

		const cryptoAddress = await primate.prisma.cryptoAddress.findFirst({
			where: { id: addressId, userId, status: 'ACTIVE' },
		});
		if(!cryptoAddress) throw new Error('Crypto address not found or inactive');

		if(cryptoAddress.blockchain !== blockchain.toUpperCase()) {
			throw new Error(`Address blockchain mismatch. Expected: ${ blockchain }, Found: ${ cryptoAddress.blockchain }`);
		}

		// 2. Llamada a la API EXTERNA (la parte lenta) ANTES de la transacción
		const junoWithdrawalData = {
			address: cryptoAddress.address,
			amount: amount.toString(),
			asset: 'MXNB',
			blockchain: blockchain.toUpperCase(),
			compliance: {},
		};

		const withdrawalResult = await JunoBitsoService.createJunoWithdrawal(junoWithdrawalData);
		if(!withdrawalResult.success) {
			throw new Error(`Juno withdrawal failed: ${ withdrawalResult.error?.message || 'Unknown error' }`);
		}

		// 3. Iniciar la transacción en la base de datos SÓLO para escrituras rápidas
		return primate.prisma.$transaction(async (tx) => {
			const withdrawalRecord = await tx.cryptoWithdrawal.create({
				data: {
					userId,
					cryptoAddressId: addressId,
					amount: amountDecimal,
					asset: 'MXNB',
					blockchain: blockchain.toUpperCase(),
					status: 'PENDING',
					junoTransactionId: withdrawalResult.payload.id || withdrawalResult.payload.transaction_id,
					destinationAddress: cryptoAddress.address,
				},
			});

			await tx.transaction.create({
				data: {
					userId,
					type: 'WITHDRAWAL_CRYPTO',
					status: 'COMPLETED',
					amount: amountDecimal.negated(),
					description: `Retiro de ${ amount } MXNB a ${ cryptoAddress.label }`,
					metas: {
						withdrawalId: withdrawalRecord.id,
						junoResponse: withdrawalResult.payload,
					},
				},
			});

			return {
				success: true,
				withdrawal: withdrawalRecord,
				message: `Successfully initiated withdrawal of ${ amount } MXNB`,
			};
		});
	}

	static async getUserWithdrawals(userId, options = {}) {
		const { limit = 25, offset = 0 } = options;
		const withdrawals = await primate.prisma.cryptoWithdrawal.findMany({
			where: { userId },
			orderBy: { created: 'desc' },
			take: parseInt(limit),
			skip: parseInt(offset),
		});
		const total = await primate.prisma.cryptoWithdrawal.count({ where: { userId } });

		return {
			success: true,
			data: withdrawals,
			meta: { total, limit, offset, hasMore: (offset + limit) < total },
		};
	}
}

export default CryptoAddressService;
