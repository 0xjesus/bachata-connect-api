import primate from '@thewebchimp/primate';
import AIService from '#services/ai.service.js';
import UserController from '#entities/users/user.controller.js';

class AIController {

    static async converse(req, res) {
        try {
            const { prompt } = req.body;
            if (!prompt) {
                return res.respond({ status: 400, message: 'Prompt is required' });
            }

            // 1. Get Authenticated User
            if (!req.user || !req.user.payload || !req.user.payload.id) {
                return res.respond({ status: 401, message: 'Unauthorized' });
            }
            const userId = req.user.payload.id;
            const user = await UserController.getMe(req); // Re-use getMe to get user context

            // 2. Find or Create the Conversation in the Database for the 'WEB' channel
            let conversation = await primate.prisma.conversation.findUnique({
                where: {
                    userId_channel: {
                        userId: userId,
                        channel: 'WEB',
                    },
                },
            });

            if (!conversation) {
                conversation = await primate.prisma.conversation.create({
                    data: {
                        userId: userId,
                        channel: 'WEB',
                        channelId: userId, // For web, we can use userId as the channelId
                    },
                });
            }

            // 3. Save the user's new message to the history
            await primate.prisma.message.create({
                data: {
                    conversationId: conversation.id,
                    userId: userId,
                    role: 'USER',
                    content: prompt,
                },
            });

            // 4. Get recent conversation history
            const dbHistory = await primate.prisma.message.findMany({
                where: { conversationId: conversation.id },
                orderBy: { created: 'desc' },
                take: 10, // Get last 10 messages to keep the context relevant
            });
            dbHistory.reverse(); // Order from oldest to newest

            // 5. Call the new, powerful AIService method with full context
            const aiResponseText = await AIService.webConversation(userId, prompt, user, dbHistory);

            // 6. Save the AI's response to the history
            if (aiResponseText) {
                await primate.prisma.message.create({
                    data: {
                        conversationId: conversation.id,
                        userId: userId, // The message is associated with the user's conversation
                        role: 'ASSISTANT',
                        content: aiResponseText,
                    },
                });
            }

            // 7. Send the response back to the client
            return res.respond({
                status: 200,
                message: 'Conversation successful',
                data: { reply: aiResponseText || "No response generated." },
            });

        } catch (error) {
            console.error("Error in AIController.converse:", error);
            return res.respond({ status: 500, message: 'Internal Server Error', error: error.message });
        }
    }
}

export default AIController;
