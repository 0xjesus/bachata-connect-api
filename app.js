import primate from '@thewebchimp/primate';
import rateLimit from 'express-rate-limit';
import '#utils/typedef.js';
import { router as ai } from '#routes/ai.js';
import { router as jb } from '#routes/juno-bitso.js';
import { router as eventRoutes } from '#routes/event.js';
import { router as eventUpdateRoutes } from '#routes/event-update.js';
import { router as updateCommentRoutes } from './routes/update-comment.js';
import { router as cryptoRoutes } from '#routes/crypto-address.js';
import * as cron from 'node-cron';
import CronService from '#services/cron.service.js';

await primate.setup();
primate.app.set('trust proxy', 1);
await primate.start();

const globalRateLimiter = rateLimit({
	windowMs: 24 * 60 * 60 * 1000,
	max: 100,
	standardHeaders: true,
	legacyHeaders: false,
	validate: { xForwardedForHeader: false },
	message: { result: 'error', status: 429, message: 'Daily request limit reached (100/day). Try again tomorrow.' },
});
primate.app.use(globalRateLimiter);

primate.app.use('/ai', ai);
primate.app.use('/jb', jb);
primate.app.use('/events', eventRoutes);
primate.app.use('/', eventUpdateRoutes);
primate.app.use('/', updateCommentRoutes);
primate.app.use('/crypto', cryptoRoutes);

cron.schedule('0 * * * *', async () => {
	try {
		await CronService.checkEventDeadlines();
	} catch (error) {
		console.error('Scheduled task failed:', error);
	}
});
