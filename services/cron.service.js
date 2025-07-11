// services/cron.service.js
import primate from '@thewebchimp/primate';
import TransactionService from '#services/transaction.service.js';

class CronService {
    /**
     * Checks for events whose funding deadline has passed and processes them.
     * - If goal is met, status becomes 'CONFIRMED'.
     * - If goal is not met, status becomes 'CANCELLED' and refunds are issued.
     */
    static async checkEventDeadlines() {
        console.log(`[CRON] ⏰ Running event deadline check at ${new Date().toISOString()}`);

        const now = new Date();
        const expiredEvents = await primate.prisma.event.findMany({
            where: {
                status: 'FUNDING',
                deadline: {
                    lt: now,
                },
            },
        });

        if (expiredEvents.length === 0) {
            console.log('[CRON] ✅ No expired events to process.');
            return;
        }

        console.log(`[CRON] 🔎 Found ${expiredEvents.length} expired events to process.`);

        for (const event of expiredEvents) {
            try {
                // Check if the goal was met
                if (event.currentAmount.gte(event.goalAmount)) {
                    // Goal Met: Update status to 'CONFIRMED'
                    console.log(`[CRON] ✅ Event ${event.id} met its goal. Confirming...`);
                    await primate.prisma.event.update({
                        where: { id: event.id },
                        data: { status: 'CONFIRMED' },
                    });
                    // Here you would typically send a notification to the host
                    console.log(`[CRON] 🎉 Event ${event.id} confirmed. Host can now request payout.`);
                } else {
                    // Goal Failed: Update status to 'CANCELLED' and issue refunds
                    console.log(`[CRON] ❌ Event ${event.id} failed to meet its goal. Cancelling and refunding...`);
                    await primate.prisma.$transaction(async (tx) => {
                        await TransactionService.createMassRefund(event.id, tx);
                        await tx.event.update({
                            where: { id: event.id },
                            data: { status: 'CANCELLED' },
                        });
                    });
                    console.log(`[CRON] 💸 Event ${event.id} cancelled and all participants have been refunded.`);
                }
            } catch (error) {
                console.error(`[CRON] 🚨 Error processing event ${event.id}:`, error.message);
                // Optionally, update event status to an error state to prevent reprocessing
                await primate.prisma.event.update({
                    where: { id: event.id },
                    data: { metas: { cronError: error.message } },
                });
            }
        }
    }
}

export default CronService;
