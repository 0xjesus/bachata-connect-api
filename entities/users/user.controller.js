import sharp from 'sharp';
import queryString from 'query-string';
import primate, { PrimateService, PrimateController, jwt } from '@thewebchimp/primate';
import UserService from '#entities/users/user.service.js';
import UploadService from '#services/upload.service.js';
import JunoBitsoService from '#services/juno-bitso.service.js';
import TransactionService from '#services/transaction.service.js';

class UserController extends PrimateController {
	static async fundMyAccount(req, res) {
		try {
			const userId = req.user.payload.id;
			const { amount, currency } = req.body;

			if(!amount || !currency) {
				return res.respond({ status: 400, message: 'Amount and currency are required.' });
			}

			const user = await primate.prisma.user.findUnique({ where: { id: userId } });

			if(!user || !user.fundingClabe) {
				return res.respond({ status: 400, message: 'User funding CLABE not found.' });
			}

			const depositPayloadForService = {
				id: `mock_${ Date.now() }`,
				amount: amount.toString(),
				destination: { account_number: user.fundingClabe },
			};

			await TransactionService.processJunoDeposit(depositPayloadForService);

			return res.respond({ status: 200, message: 'Account funded successfully.' });

		} catch(error) {
			console.error('Error in fundMyAccount:', error);
			return res.respond({ status: 500, message: 'Internal Server Error: ' + error.message });
		}
	}

	static async getMe(req, paramId = '') {
		let signedUserId = paramId;
		if(paramId === 'me' || !paramId) {
			if(!req.user?.payload?.id) throw new Error('Unauthorized: No user found');
			signedUserId = req.user.payload.id;
		}
		if(!signedUserId) throw new Error('Unauthorized: No user id provided');

		const user = await primate.prisma.user.findUnique({ where: { id: signedUserId } });
		if(!user) throw new Error('User not found');

		delete user.password;
		delete user.walletPrivateKey;

		const calculatedBalance = await TransactionService.getUserBalance(user.id);

		user.balance = {
			available: calculatedBalance.toFixed(2),
			total: calculatedBalance.toFixed(2),
			locked: '0.00',
			currency: 'MXNB',
			source: 'internal_ledger',
			status: 'OK',
			clabe: user.fundingClabe,
			lastUpdated: new Date().toISOString(),
		};

		return user;
	}

	static async me(req, res) {
		try {
			const userWithBalance = await UserController.getMe(req);
			return res.respond({
				data: userWithBalance,
				message: 'User retrieved successfully with calculated balance',
			});
		} catch(e) {
			return res.respond({ status: 400, message: e.message });
		}
	}

	static async getBalance(req, res) {
		try {
			const userWithBalance = await UserController.getMe(req);
			return res.respond({
				data: userWithBalance.balance,
				message: 'Calculated balance retrieved successfully',
			});
		} catch(e) {
			return res.respond({ status: 500, message: 'Error retrieving balance: ' + e.message });
		}
	}

	static async getActivitySummary(req, res) {
		function getTransactionTitle(transaction) {
			const titles = {
				'DEPOSIT_JUNO': 'Depósito recibido',
				'EVENT_CONTRIBUTION': 'Participación en evento',
				'EVENT_REFUND': 'Reembolso recibido',
				'HOST_PAYOUT': 'Pago como organizador',
				'WITHDRAWAL_CRYPTO': 'Retiro Crypto',
			};
			return titles[transaction.type] || transaction.type;
		}

		function getTransactionDescription(transaction) {
			switch(transaction.type) {
				case 'DEPOSIT_JUNO':
					return `Depósito SPEI de $${ parseFloat(transaction.amount).toLocaleString() }`;
				case 'EVENT_CONTRIBUTION':
					return transaction.event ? `Aportaste a "${ transaction.event.title }"` : 'Aportación a evento';
				case 'EVENT_REFUND':
					return transaction.event ? `Reembolso de "${ transaction.event.title }"` : 'Reembolso recibido';
				case 'HOST_PAYOUT':
					return transaction.event ? `Recibiste pago por "${ transaction.event.title }"` : 'Pago de organizador';
				default:
					return transaction.description || 'Movimiento en tu cuenta';
			}
		}

		function getTransactionIcon(type) {
			const icons = {
				'DEPOSIT_JUNO': 'arrow-down-circle',
				'EVENT_CONTRIBUTION': 'musical-note',
				'EVENT_REFUND': 'arrow-left-circle',
				'HOST_PAYOUT': 'cash',
				'WITHDRAWAL_CRYPTO': 'arrow-up-right',
			};
			return icons[type] || 'document';
		}

		function getTransactionColor(type) {
			const colors = {
				'DEPOSIT_JUNO': 'success',
				'EVENT_CONTRIBUTION': 'primary',
				'EVENT_REFUND': 'secondary',
				'HOST_PAYOUT': 'accent',
				'WITHDRAWAL_CRYPTO': 'warning',
			};
			return colors[type] || 'gray';
		}

		try {
			if(!req.user?.payload?.id) {
				return res.respond({ status: 401, message: 'Unauthorized' });
			}
			const userId = req.user.payload.id;
			const { limit = 10 } = req.query;

			const transactions = await TransactionService.getUserTransactionHistory(userId, { limit: parseInt(limit) });
			const activityFeed = transactions.map(transaction => ({
				id: `transaction-${ transaction.id }`,
				type: 'transaction',
				subtype: transaction.type,
				title: getTransactionTitle(transaction),
				description: getTransactionDescription(transaction),
				amount: transaction.amount,
				currency: transaction.currency,
				status: transaction.status,
				timestamp: transaction.created,
				icon: getTransactionIcon(transaction.type),
				color: getTransactionColor(transaction.type),
			}));

			return res.respond({
				data: { activities: activityFeed },
				message: 'Activity summary retrieved successfully',
			});
		} catch(error) {
			return res.respond({ status: 500, message: 'Error retrieving activity summary: ' + error.message });
		}
	}

	static async getTransactions(req, res) {
		try {
			if(!req.user?.payload?.id) {
				return res.respond({ status: 401, message: 'Unauthorized' });
			}
			const userId = req.user.payload.id;
			const { limit = 25, offset = 0 } = req.query;
			const transactions = await TransactionService.getUserTransactionHistory(userId, { limit, offset });
			const total = await primate.prisma.transaction.count({ where: { userId } });

			return res.respond({
				data: transactions,
				meta: {
					total,
					limit: parseInt(limit),
					offset: parseInt(offset),
					hasMore: (parseInt(offset) + parseInt(limit)) < total,
				},
				message: 'Transactions retrieved successfully',
			});
		} catch(error) {
			return res.respond({ status: 500, message: 'Error retrieving transactions: ' + error.message });
		}
	}

	static async getStats(req, res) {
		try {
			if(!req.user?.payload?.id) {
				return res.respond({ status: 401, message: 'Unauthorized' });
			}
			const userId = req.user.payload.id;

			const financialStatsResponse = await TransactionService.getUserFinancialStats(userId);
			const eventsCreated = await primate.prisma.event.findMany({
				where: { hostId: userId },
				include: { _count: { select: { participants: true } } },
			});
			const participations = await primate.prisma.participation.findMany({
				where: { userId },
				include: { event: { select: { id: true, title: true, status: true } } },
			});

			const stats = {
				financial: financialStatsResponse.success ? financialStatsResponse.data : {},
				eventsAsHost: {
					total: eventsCreated.length,
					active: eventsCreated.filter(e => e.status === 'FUNDING').length,
					completed: eventsCreated.filter(e => e.status === 'COMPLETED').length,
					totalParticipants: eventsCreated.reduce((sum, e) => sum + e._count.participants, 0),
					totalRaised: eventsCreated.reduce((sum, e) => sum + parseFloat(e.currentAmount || 0), 0),
				},
				eventsAsParticipant: {
					total: participations.length,
					totalContributed: participations.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0),
				},
				memberSince: req.user.registered || req.user.created,
			};

			return res.respond({ data: stats, message: 'User statistics retrieved successfully' });
		} catch(error) {
			return res.respond({ status: 500, message: 'Error retrieving user statistics: ' + error.message });
		}
	}

	static async googleByPass(req, res) {
		try {
			const { email, displayName, id, photoUrl } = req.body;
			if(!email) {
				return res.respond({ status: 400, message: 'Missing email' });
			}
			const { user, accessToken } = await UserService.googleByPass({ email, displayName, id, photoUrl });
			return res.respond({ data: user, message: 'User logged successfully', props: { accessToken } });
		} catch(e) {
			return res.respond({ status: 400, message: 'Error logging in with Google: ' + e.message });
		}
	};

	static async updateProfile(req, res) {
		try {
			let idUser = req.params.id;
			if(idUser === 'me') {
				if(!req.user?.payload?.id) return res.respond({ status: 401, message: 'Unauthorized' });
				idUser = req.user.payload.id;
			}
			const currentUser = await PrimateService.findById('user', idUser);
			if(!currentUser) throw new Error('User not found');
			const userInfo = { ...currentUser, ...req.body };
			const user = await UserService.update(idUser, userInfo);
			return res.respond({ data: user, message: 'User updated successfully' });
		} catch(e) {
			return res.respond({ status: 400, message: 'User update error: ' + e.message });
		}
	}

	static async editProfile(req, res) {
		try {
			const user = await UserController.getMe(req, req.params.id);
			if(!user) throw new Error('User not found');
			const body = { ...req.body, metas: { ...user.metas, ...req.body.metas } };
			if(req.body.gender) body.metas.gender = req.body.gender;
			if(req.body.dateOfBirth) body.metas.dateOfBirth = req.body.dateOfBirth;
			const updatedUser = await UserService.update(user.id, body);
			return res.respond({ data: updatedUser, message: 'User updated successfully' });
		} catch(e) {
			return res.respond({ status: 400, message: 'User update error: ' + e.message });
		}
	}

	static async editPassword(req, res) {
		try {
			const user = await UserController.getMe(req, req.params.id);
			if(!user) throw new Error('User not found');
			if(!req.body.password) throw new Error('Password is required');
			const updatedUser = await UserService.update(user.id, { password: req.body.password });
			return res.respond({ data: updatedUser, message: 'User updated successfully' });
		} catch(e) {
			return res.respond({ status: 400, message: 'User update error: ' + e.message });
		}
	}

	static async register(req, res) {
		try {
			delete req.body.passwordConfirmation;
			const user = await UserService.create(req.body);
			return res.respond({ data: user, message: 'User created successfully' });
		} catch(e) {
			let message = 'Error creating user: ' + e.message;
			if(e.code === 'P2002') {
				message = 'Error creating user: Username already exists';
			}
			return res.respond({ status: 400, message });
		}
	};

	static async login(req, res) {
		try {
			const { user, accessToken } = await UserService.login(req.body);
			return res.respond({ data: user, message: 'Account login successful', props: { accessToken } });
		} catch(e) {
			return res.respond({ status: 400, message: 'Error login user: ' + e.message });
		}
	};

	static async avatar(req, res) {
		if(!req.params.id) throw new Error('No user id provided');
		const {
			size = 128,
			width = 128,
			height = 128,
			bold = true,
			background = 'FFFFFF',
			color = '000000',
			fontSize = 64,
			border = 2,
			chars = 2,
			mode = 'light',
			format = 'png',
		} = req.query;
		const options = { size, width, height, bold, background, color, fontSize, border, chars, format };
		if(mode === 'dark') {
			options.background = '000000';
			options.color = 'FFFFFF';
		}
		const query = queryString.stringify(options);
		try {
			const user = await PrimateService.findById('user', req.params.id);
			let attachment;
			if(user.metas?.idAvatar) {
				try {
					attachment = await PrimateService.findById('attachment', user.metas.idAvatar);
				} catch(e) {
					console.error('Error getting attachment:', e);
				}
			}
			if(attachment && attachment.metas?.location) {
				res.redirect(attachment.metas.location);
			} else {
				let initials = (user.firstname || '' + ' ' + user.lastname || '').trim();
				if(!initials) initials = user.username;
				if(!initials) initials = 'NA';
				res.redirect(`https://ui-avatars.com/api/?name=${ initials }&${ query }`);
			}
		} catch(e) {
			res.redirect(`https://ui-avatars.com/api/?name=NA&${ query }`);
		}
	};

	static async updateAvatar(req, res) {
		try {
			let idUser = req.params.id;
			if(idUser === 'me') {
				if(!req.user?.payload?.id) return res.respond({ status: 401, message: 'Unauthorized' });
				idUser = req.user.payload.id;
			}
			if(!req.file) return res.respond({ status: 400, message: 'No file received' });
			const file = req.file;
			const currentUser = await PrimateService.findById('user', idUser);
			if(!currentUser) throw new Error('User not found');
			const avatarBuffer = await sharp(file.buffer).resize(800, 800, { fit: 'cover' }).toBuffer();
			const originalAttachment = await UploadService.createAttachment(file);
			const avatarAttachment = await UploadService.createAttachment({
				buffer: avatarBuffer,
				size: avatarBuffer.length,
				originalname: `avatar-${ file.originalname }`,
				mimetype: file.mimetype,
			}, { metas: { type: 'avatar', originalAttachment: originalAttachment.id } });
			const updatedUser = await UserService.update(idUser, {
				metas: {
					...currentUser.metas,
					idAvatar: avatarAttachment.id,
					idAvatarOriginal: originalAttachment.id,
				},
			});
			return res.respond({
				data: { user: updatedUser, avatar: avatarAttachment, original: originalAttachment },
				message: 'User avatar updated successfully',
			});
		} catch(e) {
			return res.respond({ status: 400, message: 'User avatar update error: ' + e.message });
		}
	}

	static async recoverAccount(req, res) {
		try {
			const { email } = req.body;
			if(!email) return res.respond({ status: 400, message: 'Email is required' });
			const user = await UserService.recoverAccount(email);
			if(!user) return res.respond({ status: 404, message: 'User not found' });
			return res.respond({ data: user, message: 'Account recovery successful' });
		} catch(e) {
			return res.respond({ status: 400, message: e.message });
		}
	}

	static async generateUserWallet(req, res) {
		try {
			const userId = req.user.payload.id;
			const updatedUser = await UserService.generateAndAssignWallet(userId);

			// Devolver el usuario actualizado sin la clave privada
			delete updatedUser.password;
			delete updatedUser.walletPrivateKey;

			return res.respond({
				data: updatedUser,
				message: 'Wallet generated and assigned successfully.',
			});
		} catch(error) {
			const statusCode = error.message.includes('already has a wallet') ? 409 : 400;
			return res.respond({ status: statusCode, message: error.message });
		}
	}

	static async getWalletPrivateKey(req, res) {
		try {
			const userId = req.user.payload.id;
			const privateKeyData = await UserService.getWalletPrivateKey(userId);
			return res.respond({
				data: privateKeyData,
				message: 'Private key retrieved successfully.',
			});
		} catch(error) {
			return res.respond({ status: 404, message: error.message });
		}
	}

	static async validateRecoveryToken(req, res) {
		try {
			const { token, key } = req.body;
			if(!token) return res.respond({ status: 400, message: 'Token is required' });
			const { user, accessToken } = await UserService.validateRecoveryToken(key, token);
			if(!user) return res.respond({ status: 404, message: 'User not found' });
			return res.respond({ data: user, message: 'Token validated successfully', props: { accessToken } });
		} catch(e) {
			return res.respond({ status: 400, message: e.message });
		}
	}
}

export default UserController;
