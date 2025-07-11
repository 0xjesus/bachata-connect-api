// app.js

import primate from '@thewebchimp/primate';
import '#utils/typedef.js';
import { router as ai } from '#routes/ai.js';
import { router as jb } from '#routes/juno-bitso.js';
import { router as eventRoutes } from '#routes/event.js';
import { router as eventUpdateRoutes } from '#routes/event-update.js';
import { router as updateCommentRoutes } from './routes/update-comment.js';
import { router as cryptoRoutes } from '#routes/crypto-address.js';
import * as cron from 'node-cron';
import CronService from '#services/cron.service.js'; // <-- NUEVA RUTA

await primate.setup();
await primate.start();

primate.app.use('/ai', ai);
primate.app.use('/jb', jb);
primate.app.use('/events', eventRoutes);
primate.app.use('/', eventUpdateRoutes);
primate.app.use('/', updateCommentRoutes);
primate.app.use('/crypto', cryptoRoutes); // <-- NUEVA RUTA CRYPTO

cron.schedule('0 * * * *', async () => {
    console.log('⏰ Running scheduled task: checkEventDeadlines');
    try {
        await CronService.checkEventDeadlines();
    } catch (error) {
        console.error('Scheduled task failed:', error);
    }
});

console.log("🚀 Cron job for event deadlines scheduled to run every hour.");
