// En AIService.js

class AIService {
	/**
	 * Handles a stateful, tool-enabled conversation for the web application.
	 * @param {string} userId - The ID of the authenticated user.
	 * @param {string} prompt - The latest message from the user.
	 * @param {object} userContext - An object with user data (name, email, etc.).
	 * @param {Array<Message>} dbHistory - The last 10-15 messages from the database for this conversation.
	 * @returns {Promise<string>} - The generated response text.
	 */
    static async webConversation(userId, prompt, userContext, dbHistory = []) {
        // Step 1: Format the database history for the OpenAI API
        const history = dbHistory.map(msg => {
            return {
                role: msg.role.toLowerCase(), // Prisma Enum is 'USER', API needs 'user'
                content: msg.content
            };
        });

        // Step 2: Create the payload for the API call
        const messages = [
            {
                role: 'system',
                content: wapaTemplates.tooledSystemPrompt + `\n\nContexto del usuario:\n${JSON.stringify(userContext)}`
            },
            ...history, // Add the formatted history
            {
                role: 'user',
                content: prompt // Add the current user message
            }
        ];

        // Step 3: Call the OpenAI API with tools
        const response = await openai.chat.completions.create({
            model: 'gpt-4-turbo', // Usamos un modelo más reciente y compatible con JSON mode
            messages: messages,
            tools: wapaTemplates.generalTools,
            tool_choice: "auto",
        });

        const responseMessage = response.choices[0].message;
        const toolCalls = responseMessage.tool_calls;

        // Step 4: Handle the function call if the AI decides to use a tool
        if (toolCalls) {
            // NOTE: For now, we'll focus on the first tool call for simplicity.
            const toolCall = toolCalls[0];
            const functionName = toolCall.function.name;
            const functionArgs = JSON.parse(toolCall.function.arguments);

            console.log(`AI is calling tool: ${functionName} with args:`, functionArgs);

            if (typeof ToolService[functionName] === 'function') {
                try {
                    // Important: Add the user's ID for context in the tool.
                    functionArgs.userId = userId;

                    // Execute the tool function
                    const toolResponse = await ToolService[functionName](functionArgs);

                    // For now, we'll just return the conversational part of the response
                    // In a real app, you might feed this back to the AI for a final summary.
                    if (functionArgs.continueConversation) {
                        // A simple placeholder replacement logic
                        let conversationText = functionArgs.continueConversation;
                        if (toolResponse && typeof toolResponse === 'object') {
                            for (const key in toolResponse) {
                                conversationText = conversationText.replace(`%${key}%`, toolResponse[key]);
                            }
                        }
                        return conversationText;
                    }

                    // Fallback if no conversation text is defined
                    return `Acción "${functionName}" completada.`;

                } catch (e) {
                    console.error('Error executing tool:', e);
                    return 'Lo siento, tuve un problema al intentar realizar esa acción.';
                }
            }
        }

        // If no tool was called, just return the AI's text response.
        return responseMessage.content;
    }
}

// Export the AIService class
export default AIService;
