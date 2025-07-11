import primate from '@thewebchimp/primate';
import CronService from './services/cron.service.js';

async function runCron() {
    console.log('--- [CRON RUNNER] Starting Cron Job ---');
    try {
        await primate.setup({ connectDb: true }); // Asegura la conexión a la BD
        await CronService.checkEventDeadlines();
        console.log('--- [CRON RUNNER] Cron Job Finished Successfully ---');
    } catch (error) {
        console.error('--- [CRON RUNNER] Cron Job Failed ---', error);
    } finally {
        await primate.prisma.$disconnect(); // Cierra la conexión para que el script termine
        console.log('--- [CRON RUNNER] Prisma disconnected ---');
        process.exit();
    }
}

runCron();
