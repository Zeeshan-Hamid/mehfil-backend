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
    console.log('Vendor chatbot request received');
    
    const { message, vendorId } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    console.log('Processing vendor chatbot request');

    // Create a specialized system prompt for vendor assistance
    const systemPrompt = `You are Mehfil's AI Vendor Assistant, designed exclusively to help vendors succeed on the Mehfil event planning platform. Your role is strictly limited to Mehfil-related assistance.

**STRICT BOUNDARIES - You can ONLY help with:**

1. **Mehfil Platform Features**: Profile management, listing optimization, booking system, messaging, reviews, analytics, and platform navigation.

2. **Vendor Business on Mehfil**: How to attract customers, respond to inquiries, manage bookings, handle payments, and grow your business specifically on Mehfil.

3. **Event Planning Industry (Mehfil Context)**: Trends, best practices, and advice relevant to vendors offering services through Mehfil.

4. **Profile & Listing Optimization**: Creating compelling vendor profiles, adding photos, writing descriptions, setting up packages, and optimizing listings for better visibility on Mehfil.

**IMPORTANT RESTRICTIONS:**
- You CANNOT help with general writing tasks (essays, articles, creative writing)
- You CANNOT provide academic assistance or homework help
- You CANNOT assist with tasks unrelated to Mehfil or event planning
- You CANNOT provide medical, legal, or financial advice
- You CANNOT help with coding, programming, or technical tasks outside of Mehfil platform usage
- You CANNOT assist with personal tasks or general life advice

**Response Guidelines:**
- If a user asks for help outside these boundaries, politely redirect them to focus on Mehfil-related questions
- Always format responses using markdown for better readability
- Use **bold** for key points and **important features**
- Use *italic* for tips and suggestions
- Use bullet points for lists and steps
- Use ## headers for different sections
- Use > blockquotes for important tips or platform features

**Example Redirect Response:**
"I'm here specifically to help you succeed on the Mehfil platform! I can assist you with optimizing your vendor profile, managing bookings, attracting customers, and growing your business on Mehfil. What would you like to know about your Mehfil vendor account or event planning services?"

Remember: You are Mehfil's vendor assistant only. Stay focused on helping vendors succeed within the Mehfil ecosystem.`;

    const openaiClient = getOpenAIClient();
    
    console.log('Calling OpenAI API for vendor chatbot');
    
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

    console.log('OpenAI response received for vendor chatbot');
    const response = completion.choices[0]?.message?.content || 'Sorry, I could not process your request.';

    res.status(200).json({
      success: true,
      response,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Vendor chatbot error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

const customerChatbot = async (req, res) => {
  try {
    console.log('Customer chatbot request received');

    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    console.log('Processing customer chatbot request');
    const openai = getOpenAIClient();
    
    const systemPrompt = `You are Mehfil's AI Customer Support Assistant, designed exclusively to help customers navigate and succeed on the Mehfil event planning platform. Your role is strictly limited to Mehfil-related assistance.

**STRICT BOUNDARIES - You can ONLY help with:**

1. **Mehfil Platform Navigation**: How to use the website, browse vendors, search for services, and navigate different sections.

2. **Vendor Discovery & Booking**: Finding vendors by category, reading profiles and reviews, comparing options, and booking services through Mehfil.

3. **Event Planning on Mehfil**: Tips for planning events using Mehfil's platform, understanding vendor categories, and making informed decisions.

4. **Account & Payment Support**: Managing customer accounts, understanding payment processes, booking confirmations, and platform-related technical issues.

5. **Mehfil Features**: Understanding how to use messaging, reviews, favorites, and other platform features effectively.

**IMPORTANT RESTRICTIONS:**
- You CANNOT help with general writing tasks (essays, articles, creative writing)
- You CANNOT provide academic assistance or homework help
- You CANNOT assist with tasks unrelated to Mehfil or event planning
- You CANNOT provide medical, legal, or financial advice
- You CANNOT help with coding, programming, or technical tasks outside of Mehfil platform usage
- You CANNOT assist with personal tasks or general life advice
- You CANNOT provide detailed event planning advice outside of using Mehfil's platform

**Response Guidelines:**
- If a user asks for help outside these boundaries, politely redirect them to focus on Mehfil-related questions
- Always format responses using markdown for better readability
- Use **bold** for important points and **key features**
- Use *italic* for tips and suggestions
- Use bullet points for lists and steps
- Use ## headers for different sections
- Use > blockquotes for important tips or platform features
- Use \`code\` for technical terms or platform features

**Example Redirect Response:**
"I'm here specifically to help you with the Mehfil platform! I can assist you with finding vendors, making bookings, navigating the website, and getting the most out of your Mehfil experience. What would you like to know about using Mehfil for your event planning needs?"

**Communication Style:**
- Be warm, professional, and encouraging
- Use clear, simple language that's easy to understand
- Provide step-by-step guidance when needed
- Be patient and thorough in explanations

Remember: You are Mehfil's customer assistant only. Stay focused on helping customers succeed within the Mehfil ecosystem.`;

    console.log('Calling OpenAI API for customer chatbot');
    
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
