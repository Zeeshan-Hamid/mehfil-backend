const OpenAI = require('openai');
const { getSearchLogAnalysis } = require('../utils/searchLogHelpers');

let openaiClient = null;

/**
 * Initialize OpenAI client
 * @returns {OpenAI} OpenAI client instance
 */
const getOpenAIClient = () => {
    if (!openaiClient) {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OPENAI_API_KEY environment variable is required');
        }

        openaiClient = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
    }

    return openaiClient;
};

/**
 * Tool function: Analyze search logs
 */
const analyzeSearchLogs = async ({ limit = 50, days = 7 }) => {
    try {
        const analysis = await getSearchLogAnalysis({ limit, days });

        // Format the response for better AI understanding
        const formattedResponse = {
            summary: {
                totalSearches: analysis.metadata.totalSearches,
                topQueriesCount: analysis.topQueries.length,
                trendingQueries: analysis.trends.trends.filter(t => t.isTrending).length,
                newQueries: analysis.trends.trends.filter(t => t.isNew).length
            },
            topSearchQueries: analysis.topQueries.map(q => ({
                query: q.query,
                searchCount: q.count,
                uniqueUsers: q.uniqueUsers,
                lastSearched: q.lastSearched,
                searchTypes: q.searchTypes
            })),
            trendingSearches: analysis.trends.trends
                .filter(t => t.isTrending || t.isNew)
                .map(t => ({
                    query: t.query,
                    currentCount: t.currentCount,
                    percentageChange: t.percentageChange,
                    isNew: t.isNew,
                    status: t.isNew ? 'NEW' : 'TRENDING UP'
                })),
            searchTypeDistribution: analysis.metadata.typeDistribution,
            userTypeBreakdown: analysis.metadata.userTypeBreakdown,
            period: analysis.trends.period
        };

        return formattedResponse;
    } catch (error) {
        console.error('Error in analyzeSearchLogs:', error);
        return {
            error: 'Failed to analyze search logs',
            message: error.message
        };
    }
};

/**
 * Tool function: Get vendor analytics
 */
const getVendorAnalytics = ({ topic }) => {
    const analytics = {
        profile_optimization: {
            tips: [
                'Complete all profile sections including business description, services, and pricing',
                'Upload high-quality photos showcasing your work',
                'Respond to customer inquiries within 24 hours',
                'Keep your availability calendar up to date',
                'Encourage satisfied customers to leave reviews'
            ],
            metrics: {
                averageResponseTime: '24 hours recommended',
                photoRecommendation: 'Minimum 5-10 high-quality images',
                profileCompleteness: 'Aim for 100% completion'
            }
        },
        booking_trends: {
            insights: [
                'Peak booking season is typically 6-12 months before events',
                'Weekend events are most popular',
                'Customers prefer vendors with quick response times',
                'Flexible pricing options increase booking rates'
            ]
        },
        customer_engagement: {
            bestPractices: [
                'Respond to messages promptly',
                'Provide detailed quotes and package information',
                'Follow up with potential customers',
                'Request reviews from satisfied clients',
                'Update your portfolio regularly'
            ]
        },
        general: {
            platformTips: [
                'Keep your profile updated and complete',
                'Respond to inquiries quickly',
                'Offer competitive and transparent pricing',
                'Showcase your best work with quality photos',
                'Build a strong reputation through excellent service'
            ]
        }
    };

    return analytics[topic] || analytics.general;
};

/**
 * Define available tools for function calling
 */
const tools = [
    {
        type: 'function',
        function: {
            name: 'analyze_search_logs',
            description: 'Analyzes user search logs to identify trending searches, popular queries, and search patterns. Use this tool when vendors ask about what users are searching for, trending topics, or search behavior insights.',
            parameters: {
                type: 'object',
                properties: {
                    limit: {
                        type: 'number',
                        description: 'Number of top search queries to analyze (default: 50)',
                    },
                    days: {
                        type: 'number',
                        description: 'Number of days to analyze for trends (default: 7)',
                    }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_vendor_analytics',
            description: 'Provides general vendor analytics and platform insights including best practices, optimization tips, and market trends. Use this when vendors ask for general business advice, platform tips, or optimization strategies.',
            parameters: {
                type: 'object',
                properties: {
                    topic: {
                        type: 'string',
                        description: 'Specific topic for analytics',
                        enum: ['profile_optimization', 'booking_trends', 'customer_engagement', 'general']
                    }
                },
                required: ['topic']
            }
        }
    }
];

/**
 * Execute a tool function
 */
const executeToolFunction = async (functionName, args) => {
    switch (functionName) {
        case 'analyze_search_logs':
            return await analyzeSearchLogs(args);
        case 'get_vendor_analytics':
            return getVendorAnalytics(args);
        default:
            return { error: `Unknown function: ${functionName}` };
    }
};

/**
 * Process a vendor chat message through the agent with streaming
 * @param {string} message - User's message
 * @param {Array} conversationHistory - Previous messages (optional)
 * @param {Object} res - Express response object for streaming
 * @returns {Promise<void>} Streams response via SSE
 */
const processVendorChatStream = async (message, conversationHistory = [], res) => {
    try {
        const client = getOpenAIClient();

        const systemPrompt = `You are Mehfil's AI Vendor Insights Agent, designed to help vendors succeed on the Mehfil event planning platform by providing data-driven insights and actionable recommendations.

**YOUR CAPABILITIES:**

1. **Search Log Analysis**: You can analyze what users are searching for on the platform, identify trending searches, and provide insights about customer demand.

2. **Vendor Analytics**: You can provide general vendor analytics, best practices, and optimization tips for the Mehfil platform.

**STRICT BOUNDARIES:**

You can ONLY help with:
- Analyzing search trends and user search behavior on Mehfil
- Providing vendor analytics and platform insights
- Offering actionable recommendations based on data
- Helping vendors understand customer demand through search patterns
- Platform optimization tips and best practices

You CANNOT help with:
- General writing tasks, essays, or creative writing
- Academic assistance or homework
- Tasks unrelated to Mehfil or event planning
- Medical, legal, or financial advice
- Coding or programming tasks
- Personal tasks or general life advice

**RESPONSE GUIDELINES:**

1. **Use Your Tools**: When vendors ask about search trends or what users are looking for, ALWAYS use the analyze_search_logs function to get real data.

2. **Be Data-Driven**: Base your recommendations on actual search data and analytics, not assumptions.

3. **Be Actionable**: Provide specific, actionable recommendations that vendors can implement immediately.

4. **Format Responses**: Use markdown formatting for clarity:
   - Use **bold** for key insights and important points
   - Use bullet points for lists
   - Use ## headers for sections
   - Use > blockquotes for important tips

5. **Stay Focused**: If asked about non-Mehfil topics, politely redirect to Mehfil-related questions.

Remember: You are a data-driven insights agent. Always use your tools to provide accurate, real-time information.`;

        // Build messages array
        const messages = [
            { role: 'system', content: systemPrompt },
            ...conversationHistory,
            { role: 'user', content: message }
        ];

        // Set up SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const toolsUsed = [];
        let fullResponse = '';

        // Helper to send SSE data
        const sendSSE = (event, data) => {
            res.write(`event: ${event}\n`);
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        };

        // Initial API call with function calling and streaming
        let stream = await client.chat.completions.create({
            model: 'gpt-4o',
            messages: messages,
            tools: tools,
            tool_choice: 'auto',
            temperature: 0.7,
            max_tokens: 1000,
            stream: true
        });

        let currentToolCalls = [];
        let currentMessage = { role: 'assistant', content: '', tool_calls: [] };

        // Process the stream
        for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta;

            if (delta?.content) {
                // Stream content to client
                fullResponse += delta.content;
                sendSSE('content', { content: delta.content });
            }

            if (delta?.tool_calls) {
                // Accumulate tool calls
                for (const toolCall of delta.tool_calls) {
                    const index = toolCall.index;

                    if (!currentToolCalls[index]) {
                        currentToolCalls[index] = {
                            id: toolCall.id || '',
                            type: 'function',
                            function: { name: '', arguments: '' }
                        };
                    }

                    if (toolCall.id) {
                        currentToolCalls[index].id = toolCall.id;
                    }
                    if (toolCall.function?.name) {
                        currentToolCalls[index].function.name = toolCall.function.name;
                    }
                    if (toolCall.function?.arguments) {
                        currentToolCalls[index].function.arguments += toolCall.function.arguments;
                    }
                }
            }

            // Check if streaming is done
            if (chunk.choices[0]?.finish_reason) {
                if (chunk.choices[0].finish_reason === 'tool_calls' && currentToolCalls.length > 0) {
                    // Tool calls detected - execute them
                    currentMessage.tool_calls = currentToolCalls;
                    messages.push(currentMessage);

                    // Notify client that tools are being executed
                    sendSSE('tool_start', { message: 'Analyzing data...' });

                    // Execute each tool call
                    for (const toolCall of currentToolCalls) {
                        const functionName = toolCall.function.name;
                        const functionArgs = JSON.parse(toolCall.function.arguments);

                        toolsUsed.push(functionName);
                        console.log(`Executing tool: ${functionName} with args:`, functionArgs);

                        // Execute the function
                        const functionResult = await executeToolFunction(functionName, functionArgs);

                        // Add function result to messages
                        messages.push({
                            role: 'tool',
                            tool_call_id: toolCall.id,
                            content: JSON.stringify(functionResult)
                        });
                    }

                    // Notify client that tools are done
                    sendSSE('tool_end', { toolsUsed });

                    // Get next response from the model with streaming
                    stream = await client.chat.completions.create({
                        model: 'gpt-4o',
                        messages: messages,
                        tools: tools,
                        tool_choice: 'auto',
                        temperature: 0.7,
                        max_tokens: 1000,
                        stream: true
                    });

                    // Reset for next iteration
                    currentToolCalls = [];
                    currentMessage = { role: 'assistant', content: '', tool_calls: [] };
                    fullResponse = '';

                    // Continue processing the new stream
                    for await (const chunk of stream) {
                        const delta = chunk.choices[0]?.delta;

                        if (delta?.content) {
                            fullResponse += delta.content;
                            sendSSE('content', { content: delta.content });
                        }

                        if (chunk.choices[0]?.finish_reason === 'stop') {
                            break;
                        }
                    }
                }
                break;
            }
        }

        // Send completion event
        sendSSE('done', {
            toolsUsed,
            timestamp: new Date().toISOString()
        });

        res.end();
    } catch (error) {
        console.error('Error in processVendorChatStream:', error);

        // Send error event
        res.write(`event: error\n`);
        res.write(`data: ${JSON.stringify({ message: error.message })}\n\n`);
        res.end();
    }
};

module.exports = {
    processVendorChatStream
};
