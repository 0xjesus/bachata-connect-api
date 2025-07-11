import primate, { jwt, PrimateService } from '@thewebchimp/primate';
import bcrypt from 'bcrypt';
import 'dotenv/config';
import moment from 'moment-timezone';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import hbs from 'handlebars';
import MandrillService from '#services/mandrill.service.js';
import JunoBitsoService from '#services/juno-bitso.service.js';
import TransactionService from '#services/transaction.service.js';
import CryptoService from '#services/crypto.service.js';
moment.locale('es');
const SALT_ROUNDS = 10;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class UserService {

	 /**
     * Genera una nueva wallet y la asigna a un usuario.
     * @param {string} userId - El ID del usuario.
     * @returns {Promise<User>} El usuario actualizado con la nueva wallet.
     * @throws {Error} Si el usuario ya tiene una wallet.
     */
    static async generateAndAssignWallet(userId) {
        const user = await primate.prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new Error("User not found.");
        if (user.walletAddress) throw new Error("User already has a wallet assigned.");

        console.log(`Generating new crypto wallet for user ${userId}...`);
        const wallet = await CryptoService.generateWallet();

        if (!wallet || !wallet.address || !wallet.privateKey) {
            throw new Error("Failed to generate crypto wallet.");
        }

        const updatedUser = await primate.prisma.user.update({
            where: { id: userId },
            data: {
                walletAddress: wallet.address,
                // ¡ADVERTENCIA DE SEGURIDAD! Guardar claves privadas sin encriptar es extremadamente peligroso.
                // En un entorno de producción, esta clave DEBE ser encriptada antes de guardarse.
                walletPrivateKey: wallet.privateKey,
                metas: {
                    ...user.metas,
                    wallet: {
                        address: wallet.address,
                        // No guardamos la privateKey en metas JSON por redundancia y seguridad.
                        mnemonic: wallet.mnemonic, // Guardar el mnemónico también es un riesgo de seguridad.
                    }
                }
            }
        });

        console.log(`✅ Wallet ${wallet.address} successfully assigned to user ${userId}.`);
        return updatedUser;
    }

    /**
     * Obtiene la clave privada de un usuario.
     * @param {string} userId - El ID del usuario.
     * @returns {Promise<{privateKey: string}>} Un objeto con la clave privada.
     * @throws {Error} Si el usuario no tiene una wallet.
     */
    static async getWalletPrivateKey(userId) {
        const user = await primate.prisma.user.findUnique({
            where: { id: userId },
            select: { walletPrivateKey: true }
        });

        if (!user || !user.walletPrivateKey) {
            throw new Error("Private key not found for this user.");
        }

        // En un entorno de producción, aquí se desencriptaría la clave.
        return { privateKey: user.walletPrivateKey };
    }

	static async registerWithPassword(userData) {
		const { email, password, ...otherData } = userData;

		const existingUser = await primate.prisma.user.findUnique({ where: { email } });
		if(existingUser) {
			throw new Error('User with this email already exists.');
		}

		const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

		const newUser = await primate.prisma.user.create({
			data: {
				...otherData,
				email,
				username: email,
				password: hashedPassword,
				status: 'active',
			},
		});

		return newUser;
	}

	static async assignClabeAndFund(userId, amountToFund) {
		const junoResponse = await JunoBitsoService.createJunoClabe();
		if(!junoResponse.success || !junoResponse.payload.clabe) {
			throw new Error('Failed to create Juno CLABE for user.');
		}
		const newClabe = junoResponse.payload.clabe;

		const updatedUser = await primate.prisma.user.update({
			where: { id: userId },
			data: { fundingClabe: newClabe },
		});

		const mockDepositPayload = {
			id: `txn_mock_${ Date.now() }`,
			amount: amountToFund.toString(),
			destination: {
				account_number: newClabe,
			},
		};

		await TransactionService.processJunoDeposit(mockDepositPayload);

		return updatedUser;
	}

	static async findByEmail(email) {
		try {
			return await primate.prisma.user.findUnique({
				where: {
					email,
				},
			});
		} catch(e) {
			throw e;
		}
	}

	static async create(data) {
		try {
			// Lógica de negocio existente
			if(data.password) data.password = bcrypt.hashSync(data.password, 8);
			if(data.username && !data.email) data.email = data.username;
			else if(data.email && !data.username) data.username = data.email;
			if(data.firstname && data.lastname) data.nicename = data.firstname + ' ' + data.lastname;
			if(data.phone) {
				data.metas = { ...data.metas, phone: data.phone };
			}
			delete data.phone;

			// --- INICIO DE LÓGICA DE CREDENCIALES ---

			// 1. Provisionar CLABE de Fondeo (como ya lo teníamos)
			console.log('Provisioning Juno CLABE for new user...');
			const junoClabe = await JunoBitsoService.createJunoClabe();
			if(junoClabe?.payload?.clabe) {
				data.fundingClabe = junoClabe.payload.clabe;
				console.log(`CLABE ${ data.fundingClabe } assigned to user ${ data.email || data.username }`);
			} else {
				console.error('FAILED to provision Juno CLABE for new user.');
				// En un caso real, podrías querer lanzar un error aquí para detener el registro
			}

			// 2. Generar Wallet de Crypto
			console.log('Generating crypto wallet for new user...');
			const wallet = await CryptoService.generateWallet();
			if(wallet?.address && wallet?.privateKey) {
				data.walletAddress = wallet.address;

				// ¡¡¡MUY IMPORTANTE!!! NUNCA guardes llaves privadas en texto plano.
				// En un proyecto real, aquí debes usar un servicio de encriptación (KMS, Vault, o la librería crypto de Node).
				// Por ahora, para el hackathon, lo dejamos así, pero es un riesgo de seguridad crítico.
				data.walletPrivateKey = wallet.privateKey; // ¡PELIGRO EN PRODUCCIÓN!

				console.log(`Wallet ${ wallet.address } assigned to user.`);
			} else {
				console.error('FAILED to generate crypto wallet for new user.');
			}

			// --- FIN DE LÓGICA DE CREDENCIALES ---

			// Primate Create
			return PrimateService.create('user', data);
		} catch(e) {
			throw e;
		}
	}

	/**
	 * Updates a user with the given data.
	 *
	 * @param {number} id - The ID of the user to update.
	 * @param {Object} data - The data to update the user with.
	 * @param {Object} [options={}] - Additional options for updating the user.
	 * @returns {Promise<Object>} - A promise that resolves to the updated user object.
	 */
	static async update(id, data, options = {}) {

		if(data.password) data.password = bcrypt.hashSync(data.password, 8);
		else delete data.password;

		return PrimateService.update('user', id, data);
	}

	/**
	 * @typedef {Object} UserLoginResponse
	 * @property {User} user - The logged-in user object.
	 * @property {string} accessToken - The access token for the user.
	 */

	/**
	 * Logs in a user with the given data.
	 *
	 * @param {Object} data - The login data containing username and password.
	 * @returns {Promise<UserLoginResponse>} - A promise that resolves to the logged-in user object with an access token.
	 * @throws {Error} - Throws an error if the login or password is missing, or if the user is not found or unauthorized.
	 */
	static async login(data) {
    const { username, password, email, nicename } = data; // Agregamos nicename

    console.log("Login data:", data);
    console.log("Username:", username);
    console.log("Nicename:", nicename); // Log nicename también
    console.log("Email:", email);
    console.log("Password:", password);

    if((!username && !email && !nicename) || !password) {
        throw Error('Missing login credentials or password');
    }

    let user = null;

    // Prioridad: email > username > nicename
    if (email) {
        user = await primate.prisma.user.findUnique({
            where: { email },
        });
    } else if (username) {
        user = await primate.prisma.user.findUnique({
            where: { username },
        });
    } else if (nicename) {
        user = await primate.prisma.user.findUnique({
            where: { nicename }, // O el campo que uses para nicename
        });
    }

    console.log("User found:", user);
    console.log(`User ${email || username || nicename} trying to log in...`);

    if(!user) throw Error('User not registered');

    // Check user is active
    if(user.status !== 'Active') throw Error('User is not active');

    const checkPassword = bcrypt.compareSync(password, user.password);
    if(!checkPassword) throw Error('Email address or password not valid');

    delete user.password;

    const accessToken = await jwt.signAccessToken(user);

    console.log(`User ${user.username || user.nicename} logged in successfully.`);
    return { user, accessToken };
}

	/**
	 * Initiates the account recovery process for a user.
	 *
	 * This method handles the account recovery process by receiving the user's email.
	 * It attempts to find the user associated with the provided email and sends a recovery email with a link
	 * containing a recovery token. If the email is not provided or if any error occurs, it throws an error.
	 *
	 * @param {string} email - The email of the user requesting account recovery.
	 * @returns {Promise<void>} - A promise that resolves when the recovery email is sent.
	 * @throws {Error} - Throws an error if the user is not found or if any other error occurs.
	 */
	static async recoverAccount(email) {

		/** @type {User} */
		const user = await primate.prisma.user.findUnique({
			where: { email },
		});

		if(!user) throw new Error('User not found');

		// generate to
		const to = [
			{
				email: user.email,
				name: user.nicename,
				type: 'to',
			},
		];

		// base 64 encode the user id, current timestamp and a random number
		const key = Buffer.from(`${ user.id }-${ Date.now() }-${ Math.random() }`).toString('base64');

		const token = await jwt.signAccessToken({
			idUser: user.id,
			type: 'magic',
			expiresIn: new Date(Date.now() + 1000 * 60 * 60 * 24), // 24 hours
		});

		await primate.prisma.link.create({
			data: {
				type: 'recover',
				token: key,
				idUser: user.id,
			},
		});

		const file = fs.readFileSync(path.resolve(__dirname, '../../assets/templates/recover.hbs'), 'utf8');
		const template = hbs.compile(file);
		const html = template({
			firstname: user.firstname,
			link: `${ process.env.CLIENT_URL }/recover/?k=${ key }&t=${ token }`,
		});

		const logo = fs.readFileSync(path.resolve(__dirname, '../../assets/images/logo.png'), 'base64');

		const message = {
			from_email: 'no-reply@iki.mx',
			from_name: 'Iki - Find your center',
			to,
			html,
			subject: 'Tu link de recuperación está aquí',
			images: [
				{
					name: 'logo',
					type: 'image/png',
					content: logo,
				},
			],
		};

		return await MandrillService.sendMessage(message);
	}

	/**
	 * Validates a recovery token.
	 *
	 * This method checks the provided recovery token and key to validate the user's recovery request.
	 * If the token and key are valid, it retrieves the user associated with the token and generates
	 * a new access token for the user. If the token or key is invalid, expired, or if any error occurs,
	 * it sends the appropriate error response.
	 *
	 * @param {string} key - The recovery key.
	 * @param {string} token - The recovery token.
	 * @returns {Promise<Object>} - A promise that resolves to an object containing the user data and a new access token.
	 * @throws {Error} - Throws an error if the link is not found, the token is expired, or the token is invalid.
	 */
	static async validateRecoveryToken(key, token) {
		const link = await primate.prisma.link.findFirst({
			where: {
				token: key,
				type: 'recover',
			},
		});

		if(!link) throw Error('Link not found');

		let payload = await jwt.verifyAccessToken(token);
		payload = payload.payload;

		// check if expired
		if(new Date(payload.expiresIn) < new Date()) {

			// update link status to expired
			await primate.prisma.link.update({
				where: {
					id: link.id,
				},
				data: {
					status: 'Expired',
				},
			});

			throw Error('Token expired');
		}

		if(parseInt(payload.idUser) !== parseInt(link.idUser)) {
			throw Error('Invalid token');
		}

		// get user
		const user = await primate.prisma.user.findUnique({
			where: { id: link.idUser },
		});

		const accessToken = await jwt.signAccessToken(user);
		return { user, accessToken };
	}

}

export default UserService;
