const OpenAI = require('openai');

let openai = null;

// Initialize OpenAI client only when needed
const getOpenAIClient = () => {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openai;
};

const vendorChatbot = async (req, res) => {
  try {
    console.log('Chatbot request received:', { body: req.body, user: req.user?.id });
    
    const { message, vendorId } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    console.log('Processing message:', message);

    // Create a specialized system prompt for vendor assistance
    const systemPrompt = `You are an AI assistant specifically designed to help vendors on the Mehfil platform manage their profiles and grow their business. You provide expert advice on:

1. Profile Optimization: How to create compelling vendor profiles, add attractive photos, write engaging descriptions, and highlight unique selling points.

2. Customer Attraction: Strategies to attract more customers, improve visibility, respond to inquiries effectively, and build customer relationships.

3. Event Planning Trends: Current trends in event planning, popular themes, seasonal demands, and emerging preferences in Muslim and Desi communities.

4. Business Growth: Pricing strategies, package offerings, marketing tips, and ways to increase bookings and revenue.

5. Platform Features: How to use Mehfil platform features effectively, manage bookings, handle reviews, and optimize listings.

6. Industry Insights: Event planning best practices, vendor success stories, and industry-specific advice.

Always provide practical, actionable advice tailored to the vendor's specific needs. Be encouraging, professional, and focus on helping them succeed on the Mehfil platform.

**Important**: Format your responses using markdown for better readability. Use:
- **Bold text** for emphasis and key points
- *Italic text* for important notes
- Bullet points for lists
- Numbered lists for step-by-step instructions
- Headers (##) for different sections
- Blockquotes for tips and best practices`;

    console.log('Initializing OpenAI client...');
    const openaiClient = getOpenAIClient();
    console.log('OpenAI client initialized successfully');

    console.log('Making OpenAI API call...');
    const completion = await openaiClient.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: message
        }
      ],
      max_tokens: 800,
      temperature: 0.7,
    });

    console.log('OpenAI API call successful');
    const response = completion.choices[0]?.message?.content || 'Sorry, I could not process your request.';

    console.log('Sending response:', response.substring(0, 100) + '...');

    res.status(200).json({
      success: true,
      response,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Chatbot API error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

const customerChatbot = async (req, res) => {
  try {
    console.log('Customer chatbot request received:', {
      method: req.method,
      url: req.url,
      body: req.body,
      user: req.user
    });

    const { message } = req.body;

    if (!message) {
      console.log('Customer chatbot error: Message is required');
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    console.log('Initializing OpenAI client for customer chatbot...');
    const openai = getOpenAIClient();
    console.log('OpenAI client initialized successfully for customer chatbot');

    const systemPrompt = `You are Mehfil's AI Customer Support Assistant, a helpful and friendly guide for customers using the Mehfil event planning platform. Your role is to:

**Primary Responsibilities:**
- Help customers navigate and understand the Mehfil platform
- Provide guidance on finding and booking vendors for events
- Answer questions about event planning, vendor selection, and booking processes
- Offer support for account management, payments, and technical issues
- Share tips and best practices for successful event planning

**Your Knowledge Base:**
- Mehfil is a comprehensive event planning platform connecting customers with vendors
- Customers can browse vendors by category (catering, decoration, photography, etc.)
- Features include vendor profiles, reviews, booking system, messaging, and payment processing
- The platform supports various event types: weddings, corporate events, parties, etc.

**Communication Style:**
- Be warm, professional, and encouraging
- Use clear, simple language that's easy to understand
- Provide step-by-step guidance when needed
- Be patient and thorough in explanations
- Use markdown formatting for better readability (bold, italic, lists, headers)

**Response Guidelines:**
- Always format responses using markdown for better readability
- Use **bold** for important points and **key features**
- Use *italic* for tips and suggestions
- Create bullet points for lists and steps
- Use ## headers for different sections
- Use > blockquotes for important tips or warnings
- Use \`code\` for technical terms or platform features

**Common Topics to Address:**
- How to find and book vendors
- Understanding vendor categories and services
- Reading reviews and making informed decisions
- Payment and booking processes
- Account management and profile settings
- Troubleshooting common issues
- Event planning tips and best practices

Remember: You're here to make the customer's experience with Mehfil smooth and enjoyable. Always be helpful, informative, and supportive!`;

    console.log('Sending request to OpenAI for customer chatbot...');
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: message
        }
      ],
      max_tokens: 800,
      temperature: 0.7,
    });

    console.log('OpenAI response received for customer chatbot');
    const response = completion.choices[0]?.message?.content || 'Sorry, I could not process your request.';

    console.log('Customer chatbot response:', response);

    res.json({
      success: true,
      response: response
    });

  } catch (error) {
    console.error('Customer chatbot error:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

module.exports = {
  vendorChatbot,
  customerChatbot
}; 