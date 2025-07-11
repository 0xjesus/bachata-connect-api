import { PrismaClient, Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const NUM_USERS = 30;
const EVENTS_PER_USER_MIN = 1;
const EVENTS_PER_USER_MAX = 4;
const MAX_PARTICIPANTS_PER_EVENT = 20;

const firstNames = ["Carlos", "Sofía", "Juan", "Valentina", "Diego", "Camila", "Luis", "Isabella", "Javier", "Mariana", "Ricardo", "Valeria", "Fernando", "Daniela", "Alejandro", "Gabriela", "Mateo", "Ana", "Miguel", "Paula"];
const lastNames = ["García", "Rodríguez", "Martínez", "Hernández", "López", "González", "Pérez", "Sánchez", "Ramírez", "Torres", "Flores", "Rivera", "Gómez", "Díaz", "Reyes", "Cruz", "Morales", "Ortiz"];

const eventTitles = [
    "Noche de Bachata Sensual", "Taller Intensivo de Bachata Dominicana", "Social de Salsa y Bachata", "Bachata en la Playa", "Competencia Amateur de Bachata", "Clase de Pasos Libres", "Retiro de Baile y Yoga", "Fiesta Blanca con Bachata", "Maratón de Baile Latino"
];

const eventDescriptions = [
    "Únete para una noche mágica de bachata sensual. Clases para principiantes y baile social hasta el amanecer.",
    "Perfecciona tu estilo con los mejores instructores de bachata dominicana. ¡No te quedes fuera!",
    "La mejor música, el mejor ambiente y los mejores bailarines. ¡Salsa y bachata toda la noche!",
    "Baila descalzo en la arena. Un evento único para conectar con la música y la naturaleza.",
    "¿Crees que tienes lo necesario? Demuestra tu talento en nuestra competencia amateur y gana grandes premios."
];

const sampleUpdates = [
    "¡Wow, ya superamos el 50% de la meta! Gracias a todos, ¡son los mejores!",
    "Recordatorio: la fecha límite para fondear es en 3 días. ¡Avisen a sus amigos!",
    "Tenemos un nuevo DJ invitado para el evento. ¡La música va a estar increíble!",
    "Lugar confirmado. ¡Nos vemos en el Salón 'La Clave'!"
];

const sampleComments = ["¡No puedo esperar!", "¡Allá nos vemos!", "¡Qué emoción!", "¿Puedo llevar a un amigo?", "¡Gracias por organizar!", "¡Esto se va a poner bueno!"];

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function getRandomElement(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomAmount(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateFakeClabe() {
    const bankCode = '646';
    const cityCode = '180';
    let accountNumber = '';
    for (let i = 0; i < 11; i++) {
        accountNumber += Math.floor(Math.random() * 10);
    }
    const controlDigit = Math.floor(Math.random() * 10);
    return `${bankCode}${cityCode}${accountNumber}${controlDigit}`;
}

function getRandomFutureDate() {
    const today = new Date();
    const futureDays = getRandomAmount(7, 60);
    today.setDate(today.getDate() + futureDays);
    return today;
}

async function seed() {
    try {
        console.log('🌱 Empezando el proceso de seeding...');

        console.log('🧹 Limpiando la base de datos...');
        await prisma.$transaction([
            prisma.updateComment.deleteMany(),
            prisma.eventUpdate.deleteMany(),
            prisma.participation.deleteMany(),
            prisma.transaction.deleteMany(),
            prisma.event.deleteMany(),
            prisma.user.deleteMany(),
        ]);
        console.log('✅ Base de datos limpia.');

        console.log(`👤 Creando ${NUM_USERS} usuarios realistas...`);
        const users = [];
        const hashedPassword = await bcrypt.hash('password123', 10);

        for (let i = 0; i < NUM_USERS; i++) {
            const firstName = getRandomElement(firstNames);
            const lastName = getRandomElement(lastNames);
            const nicename = `${firstName} ${lastName}`;
            const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${getRandomAmount(1,99)}@example.com`;
            const fundingClabe = generateFakeClabe();

            const user = await prisma.user.create({
                data: {
                    email: email,
                    nicename: nicename,
                    password: hashedPassword,
                    fundingClabe: fundingClabe,
                    metas: {
                        bio: `Apasionado/a por la bachata y los eventos sociales. Buscando siempre la mejor pista de baile.`,
                    }
                },
            });
            console.log(` -> Usuario Creado: ${user.nicename} con CLABE ${user.fundingClabe}`);
            users.push(user);
        }
        console.log(`✅ ${users.length} usuarios creados.`);

        console.log('💰 Simulando depósitos para dar saldo a los usuarios...');
        for (const user of users) {
            const numDeposits = getRandomAmount(2, 5);
            for (let i = 0; i < numDeposits; i++) {
                await prisma.transaction.create({
                    data: {
                        type: 'SPEI_DEPOSIT',
                        status: 'COMPLETED',
                        amount: new Prisma.Decimal(getRandomAmount(500, 5000)),
                        currency: 'MXN',
                        userId: user.id,
                        externalTransactionId: `mock_deposit_${user.id}_${i}`
                    }
                });
            }
        }
        console.log('✅ Depósitos simulados creados.');

        console.log(`🎉 Creando eventos variados...`);
        const events = [];
        for (const user of users) {
            const numEvents = getRandomAmount(EVENTS_PER_USER_MIN, EVENTS_PER_USER_MAX);
            for (let i = 0; i < numEvents; i++) {
                const targetAmount = new Prisma.Decimal(getRandomAmount(2000, 15000));
                const eventDate = getRandomFutureDate();
                const fundingDeadline = new Date(eventDate);
                fundingDeadline.setDate(fundingDeadline.getDate() - getRandomAmount(3, 7));
                const title = getRandomElement(eventTitles);

                const event = await prisma.event.create({
                    data: {
                        title: `${title} por ${user.nicename}`,
                        publicSlug: `slug-${getRandomAmount(10000, 99999)}-${i}`,
                        description: getRandomElement(eventDescriptions),
                        targetAmount: targetAmount,
                        eventDate: eventDate,
                        fundingDeadline: fundingDeadline,
                        hostId: user.id,
                        status: 'FUNDING',
                        hostFeePercentage: 5.0,
                    }
                });
                events.push(event);
            }
        }
        console.log(`✅ ${events.length} eventos creados.`);

        console.log('🚀 Optimizando: Pre-calculando saldos de usuarios...');
        const userBalances = new Map();
        for (const user of users) {
            const deposits = await prisma.transaction.aggregate({ _sum: { amount: true }, where: { userId: user.id, type: 'SPEI_DEPOSIT' } });
            const initialBalance = deposits._sum.amount || new Prisma.Decimal(0);
            userBalances.set(user.id, initialBalance);
        }
        console.log('✅ Saldos calculados.');

        console.log('💃 Agregando participantes a los eventos (de forma eficiente)...');
        let participationsCount = 0;
        for (const event of events) {
            const potentialParticipants = users.filter(u => u.id !== event.hostId);
            shuffleArray(potentialParticipants);

            const numToParticipate = getRandomAmount(3, Math.min(MAX_PARTICIPANTS_PER_EVENT, potentialParticipants.length));
            const finalParticipants = potentialParticipants.slice(0, numToParticipate);

            for (const participant of finalParticipants) {
                const contributionAmount = new Prisma.Decimal(getRandomAmount(150, 600));
                const currentBalance = userBalances.get(participant.id) || new Prisma.Decimal(0);

                if (currentBalance.greaterThanOrEqualTo(contributionAmount)) {
                    await prisma.$transaction(async (tx) => {
                        const participation = await tx.participation.create({ data: { amount: contributionAmount, userId: participant.id, eventId: event.id } });
                        await tx.transaction.create({ data: { type: 'EVENT_FUNDING', status: 'COMPLETED', amount: contributionAmount, currency: 'MXN', userId: participant.id, eventId: event.id, participationId: participation.id } });
                        await tx.event.update({ where: { id: event.id }, data: { currentAmount: { increment: contributionAmount } } });
                    });

                    userBalances.set(participant.id, currentBalance.minus(contributionAmount));
                    participationsCount++;
                }
            }
        }
        console.log(`✅ ${participationsCount} participaciones creadas.`);

        console.log('💬 Creando actualizaciones y comentarios...');
        let updatesCount = 0;
        let commentsCount = 0;
        for (const event of events) {
            const participantsResult = await prisma.participation.findMany({ where: { eventId: event.id }, select: { userId: true } });
            const participantIds = participantsResult.map(p => p.userId);

            if (participantIds.length > 0) {
                const numUpdates = getRandomAmount(1, 3);
                for (let i = 0; i < numUpdates; i++) {
                    const update = await prisma.eventUpdate.create({ data: { content: getRandomElement(sampleUpdates), eventId: event.id, authorId: event.hostId } });
                    updatesCount++;
                    const numComments = getRandomAmount(2, 6);
                    for (let j = 0; j < numComments; j++) {
                        await prisma.updateComment.create({ data: { content: getRandomElement(sampleComments), updateId: update.id, authorId: getRandomElement(participantIds) } });
                        commentsCount++;
                    }
                }
            }
        }
        console.log(`✅ ${updatesCount} actualizaciones y ${commentsCount} comentarios creados.`);

        console.log('✨ Seeding completado con éxito. ¡Tu base de datos está lista para la batalla! ✨');
    } catch (e) {
        console.error('❌ Error durante el seeding:', e);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

seed();
