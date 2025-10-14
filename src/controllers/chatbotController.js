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
    
    
    const { message, vendorId } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    

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

    
    const response = completion.choices[0]?.message?.content || 'Sorry, I could not process your request.';

    res.status(200).json({
      success: true,
      response,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    // Chatbot API error details
    
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

const customerChatbot = async (req, res) => {
  try {
    // Customer chatbot request received

    const { message } = req.body;

    if (!message) {
      
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    
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

const generateOfferings = async (req, res) => {
  try {
    const { businessDescription, category } = req.body;

    if (!businessDescription || !category) {
      return res.status(400).json({
        success: false,
        message: 'Business description and category are required'
      });
    }

    // Validate category to prevent misuse
    const allowedCategories = [
      'Drinks', 'Desserts', 'Decor', 'Henna', 'Food', 'Videography', 
      'Venue Management', 'Entertainment', 'Hair', 'Makeup', 'Photography', 
      'Catering', 'Wedding Planner', 'Event Planner', 'Other'
    ];

    if (!allowedCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid category provided'
      });
    }

    const openaiClient = getOpenAIClient();

    // Strict prompt engineering for offerings generation
    const systemPrompt = `You are an AI assistant specialized in generating professional service offerings for event planning businesses on the Mehfil platform. Your ONLY task is to analyze business descriptions and generate relevant, professional service offerings.

**STRICT REQUIREMENTS:**
1. You MUST only generate service offerings related to the provided business description and category
2. You MUST return ONLY a JSON array of strings, no other text or formatting
3. You MUST generate 5-12 relevant offerings maximum
4. You MUST use professional, clear language suitable for business listings
5. You MUST focus on specific services, not generic categories
6. You MUST NOT include pricing, costs, or time estimates
7. You MUST NOT include personal information or contact details
8. You MUST NOT generate offerings unrelated to the business description

**OUTPUT FORMAT:**
Return ONLY a valid JSON array like this:
["Service 1", "Service 2", "Service 3"]

**EXAMPLES:**
For Photography: ["Professional photo editing", "Online gallery access", "Multiple photographer coverage", "Engagement session", "Print packages"]
For Catering: ["Buffet setup", "Professional serving staff", "Menu customization", "Cleanup services", "Dietary accommodations"]

**VALIDATION RULES:**
- Each offering must be 2-8 words long
- Use title case for proper nouns only
- Be specific and actionable
- Focus on what the customer receives
- Avoid vague terms like "quality service" or "best experience"

Remember: You are ONLY generating service offerings. Do not provide explanations, advice, or any other content.`;

    const userPrompt = `Business Category: ${category}
Business Description: ${businessDescription}

Generate professional service offerings for this business. Return only a JSON array of strings.`;

    const completion = await openaiClient.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: userPrompt
        }
      ],
      max_tokens: 500,
      temperature: 0.3, // Lower temperature for more consistent, professional output
    });

    const response = completion.choices[0]?.message?.content || '[]';
    
    // Parse and validate the JSON response
    let offerings;
    try {
      offerings = JSON.parse(response);
      if (!Array.isArray(offerings)) {
        throw new Error('Response is not an array');
      }
      
      // Validate each offering
      const validatedOfferings = offerings.filter(offering => {
        return typeof offering === 'string' && 
               offering.trim().length > 0 && 
               offering.length <= 100 &&
               offering.length >= 2;
      });

      if (validatedOfferings.length === 0) {
        throw new Error('No valid offerings generated');
      }

      res.status(200).json({
        success: true,
        offerings: validatedOfferings,
        timestamp: new Date().toISOString()
      });

    } catch (parseError) {
      console.error('Error parsing AI response:', parseError);
      res.status(500).json({
        success: false,
        message: 'Failed to generate valid offerings. Please try again.',
        error: 'Invalid AI response format'
      });
    }

  } catch (error) {
    console.error('Generate offerings error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

const generateDescription = async (req, res) => {
  try {
    const { businessName, category, offerings, businessDetails } = req.body;

    if (!businessName || !category) {
      return res.status(400).json({
        success: false,
        message: 'Business name and category are required'
      });
    }

    // Validate category to prevent misuse
    const allowedCategories = [
      'Drinks', 'Desserts', 'Decor', 'Henna', 'Food', 'Videography', 
      'Venue Management', 'Entertainment', 'Hair', 'Makeup', 'Photography', 
      'Catering', 'Wedding Planner', 'Event Planner', 'Other'
    ];

    if (!allowedCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid category provided'
      });
    }

    const openaiClient = getOpenAIClient();

    // Strict prompt engineering for description generation
    const systemPrompt = `You are an AI assistant specialized in generating professional business descriptions for event planning services on the Mehfil platform. Your ONLY task is to create compelling, professional business descriptions.

**STRICT REQUIREMENTS:**
1. You MUST generate a professional business description suitable for a vendor listing
2. You MUST return ONLY the description text, no other formatting or explanations
3. You MUST keep the description between 50-200 words (maximum 1000 characters)
4. You MUST use professional, engaging language that attracts customers
5. You MUST focus on the value proposition and what makes the business special
6. You MUST include relevant keywords for the category
7. You MUST NOT include pricing, contact information, or specific dates
8. You MUST NOT include personal information or testimonials
9. You MUST NOT use overly promotional language or excessive exclamation marks
10. You MUST write in third person (e.g., "We provide..." not "I provide...")
11. You MUST be concise and to the point - prioritize quality over length

**OUTPUT FORMAT:**
Return ONLY the description text as a single paragraph. No quotes, no formatting, no additional text.

**TONE GUIDELINES:**
- Professional and trustworthy
- Engaging but not overly salesy
- Clear and informative
- Focus on benefits and value
- Use active voice when possible

**EXAMPLES:**
For Photography: "We specialize in capturing life's most precious moments with artistic vision and technical expertise. Our professional photography services include wedding coverage, engagement sessions, and special events. We deliver high-quality images with professional editing and online gallery access, ensuring every detail is captured beautifully to create timeless memories."

Remember: You are ONLY generating a business description. Do not provide explanations, advice, or any other content.`;

    const userPrompt = `Business Name: ${businessName}
Category: ${category}
${offerings && offerings.length > 0 ? `Services: ${offerings.join(', ')}` : ''}
${businessDetails ? `Additional Details: ${businessDetails}` : ''}

Generate a professional business description for this vendor listing. Return only the description text.`;

    const completion = await openaiClient.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: userPrompt
        }
      ],
      max_tokens: 300,
      temperature: 0.4, // Lower temperature for more consistent, professional output
    });

    const response = completion.choices[0]?.message?.content || '';
    
    // Validate the response
    if (!response || response.trim().length < 50) {
      throw new Error('Generated description is too short');
    }

    // Truncate if too long instead of throwing error
    let finalDescription = response.trim();
    if (finalDescription.length > 1000) {
      finalDescription = finalDescription.substring(0, 997) + '...';
    }

    res.status(200).json({
      success: true,
      description: finalDescription,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Generate description error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

const generatePackage = async (req, res) => {
  try {
    const { packageName, pricingMode, category, businessDetails, basePrice } = req.body;

    if (!packageName || !pricingMode || !category) {
      return res.status(400).json({
        success: false,
        message: 'Package name, pricing mode, and category are required'
      });
    }

    // Validate pricing mode
    const allowedPricingModes = ['perAttendee', 'flatPrice'];
    if (!allowedPricingModes.includes(pricingMode)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid pricing mode provided'
      });
    }

    // Validate category
    const allowedCategories = [
      'Drinks', 'Desserts', 'Decor', 'Henna', 'Food', 'Videography', 
      'Venue Management', 'Entertainment', 'Hair', 'Makeup', 'Photography', 
      'Catering', 'Wedding Planner', 'Event Planner', 'Other'
    ];

    if (!allowedCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid category provided'
      });
    }

    const openaiClient = getOpenAIClient();

    // Strict prompt engineering for package generation
    const systemPrompt = `You are an AI assistant specialized in generating professional event planning packages for the Mehfil platform. Your ONLY task is to create compelling package descriptions and offerings.

**STRICT REQUIREMENTS:**
1. You MUST generate a professional package description and relevant offerings
2. You MUST return ONLY a JSON object with specific fields
3. You MUST keep the description between 30-150 words (maximum 500 characters)
4. You MUST generate 3-8 relevant offerings for the package
5. You MUST use professional, engaging language that attracts customers
6. You MUST focus on the value proposition and what's included
7. You MUST include relevant keywords for the category
8. You MUST NOT include pricing, contact information, or specific dates
9. You MUST NOT include personal information or testimonials
10. You MUST NOT use overly promotional language or excessive exclamation marks
11. You MUST write in third person (e.g., "This package includes..." not "I include...")
12. You MUST be concise and to the point - prioritize quality over length
13. You MUST NOT include the package name in the description - focus on what's included
14. You MUST NOT include any pricing information - the vendor will set their own prices

**OUTPUT FORMAT:**
Return ONLY a valid JSON object like this:
{
  "description": "Professional package description here...",
  "offerings": ["Offering 1", "Offering 2", "Offering 3"]
}

**PRICING MODE GUIDELINES:**
- For "perAttendee": Focus on scalable services, mention per-person benefits
- For "flatPrice": Focus on complete service packages, fixed deliverables

**TONE GUIDELINES:**
- Professional and trustworthy
- Engaging but not overly salesy
- Clear and informative
- Focus on benefits and value
- Use active voice when possible

**EXAMPLES:**
For Photography perAttendee: {
  "description": "Professional photography coverage that scales with your guest count. Includes multiple photographer coverage, professional editing, and online gallery access. Perfect for capturing every moment of your special day.",
  "offerings": ["Multiple photographer coverage", "Professional photo editing", "Online gallery access", "High-resolution images", "Same-day preview", "Print-ready files"]
}

For Catering flatPrice: {
  "description": "Complete catering solution for your event with professional service and cleanup. Includes buffet setup, serving staff, and all necessary equipment. Perfect for hassle-free event dining.",
  "offerings": ["Buffet setup and service", "Professional serving staff", "All necessary equipment", "Menu customization", "Cleanup services", "Dietary accommodations"]
}

Remember: Do NOT include package names or prices in your response. Focus only on what the package includes and delivers.

Remember: You are ONLY generating package content. Do not provide explanations, advice, or any other content.`;

    const userPrompt = `Package Name: ${packageName}
Pricing Mode: ${pricingMode}
Category: ${category}
${businessDetails ? `Business Details: ${businessDetails}` : ''}

Generate a professional package description and offerings for this package. The vendor will set their own price, so focus only on what the package includes and delivers. Return only the JSON object.`;

    const completion = await openaiClient.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: userPrompt
        }
      ],
      max_tokens: 400,
      temperature: 0.3, // Lower temperature for more consistent, professional output
    });

    const response = completion.choices[0]?.message?.content || '{}';
    
    // Clean the response to extract JSON from markdown if present
    let cleanedResponse = response.trim();
    
    // Remove markdown code blocks if present
    if (cleanedResponse.startsWith('```json')) {
      cleanedResponse = cleanedResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    
    // Parse and validate the JSON response
    let packageData;
    try {
      packageData = JSON.parse(cleanedResponse);
      
      if (!packageData.description || !packageData.offerings) {
        throw new Error('Missing required fields in response');
      }
      
      if (!Array.isArray(packageData.offerings)) {
        throw new Error('Offerings must be an array');
      }
      
      // Validate description length
      if (packageData.description.length > 500) {
        packageData.description = packageData.description.substring(0, 497) + '...';
      }
      
      // Validate offerings
      const validatedOfferings = packageData.offerings.filter(offering => {
        return typeof offering === 'string' && 
               offering.trim().length > 0 && 
               offering.length <= 100 &&
               offering.length >= 2;
      });

      if (validatedOfferings.length === 0) {
        throw new Error('No valid offerings generated');
      }

      packageData.offerings = validatedOfferings;

      res.status(200).json({
        success: true,
        package: packageData,
        timestamp: new Date().toISOString()
      });

    } catch (parseError) {
      console.error('Error parsing AI response:', parseError);
      res.status(500).json({
        success: false,
        message: 'Failed to generate valid package content. Please try again.',
        error: 'Invalid AI response format'
      });
    }

  } catch (error) {
    console.error('Generate package error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

const generateEventChecklist = async (req, res) => {
  try {
    const { 
      eventType, 
      eventDate, 
      guestCount, 
      budget, 
      location, 
      theme, 
      specialRequirements,
      planningThoughts 
    } = req.body;

    // Validation
    if (!eventType || !eventDate || !guestCount) {
      return res.status(400).json({
        success: false,
        message: 'Event type, date, and guest count are required'
      });
    }

    const openaiClient = getOpenAIClient();

    const systemPrompt = `You are an expert wedding and event planner AI. Generate a comprehensive event planning checklist with vendor categories and timeline-based tasks.

**STRICT REQUIREMENTS:**
1. Return ONLY a valid JSON object with the exact structure specified - NO markdown formatting, NO code blocks, NO explanations
2. Generate 8-12 vendor categories relevant to the event type
3. For each category, generate 3-8 specific tasks organized by timeline
4. Include priority levels (high/medium/low) for each task
5. Tasks must be actionable and specific
6. Timeline phases: "6+ months before", "3-6 months before", "1-3 months before", "1 month before", "1-2 weeks before", "1 week before", "Day of event"
7. Start your response directly with { and end with } - no other text
8. Pay special attention to the user's event vision and planning thoughts - incorporate their specific concerns, preferences, and ideas into the tasks
9. If the user mentions budget concerns, include cost-saving tips in task descriptions
10. If the user mentions specific themes or styles, tailor tasks to support that vision
11. If the user mentions accessibility or special needs, include relevant tasks

**OUTPUT FORMAT:**
{
  "eventTitle": "Suggested event title",
  "eventDescription": "Brief description of the event",
  "categories": [
    {
      "name": "Category Name",
      "icon": "icon-name",
      "tasks": [
        {
          "taskName": "Specific task description",
          "timelinePhase": "Timeline phase",
          "priority": "high|medium|low",
          "description": "Detailed task description"
        }
      ]
    }
  ]
}

**VENDOR CATEGORIES** (select relevant based on event type):
Photography, Videography, Venue, Catering, Decor, Entertainment, Hair & Makeup, Wedding Planner, Florist, DJ/Music, Invitations, Transportation, Accommodations, Cake & Desserts, Drinks & Bar, Henna, Attire, Gifts & Favors

**EXAMPLE FOR WEDDING:**
{
  "eventTitle": "Wedding Celebration",
  "eventDescription": "A beautiful wedding celebration for [guest count] guests",
  "categories": [
    {
      "name": "Venue",
      "icon": "venue",
      "tasks": [
        {
          "taskName": "Research and shortlist 5-8 venues",
          "timelinePhase": "6+ months before",
          "priority": "high",
          "description": "Visit potential venues that accommodate your guest count and match your theme"
        },
        {
          "taskName": "Book final venue and sign contract",
          "timelinePhase": "6+ months before",
          "priority": "high",
          "description": "Secure your venue with deposit and review all terms"
        }
      ]
    }
  ]
}`;

    const userPrompt = `Event Type: ${eventType}
Event Date: ${eventDate}
Guest Count: ${guestCount}
Budget: ${budget || 'Not specified'}
Location: ${location}
Theme/Style: ${theme || 'Not specified'}
Special Requirements: ${specialRequirements?.join(', ') || 'None'}
User's Event Vision and Planning Thoughts: ${planningThoughts || 'No additional details provided'}

Generate a comprehensive event planning checklist that takes into account the user's specific vision, concerns, and preferences mentioned above.`;

    const completion = await openaiClient.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      max_tokens: 3000,
      temperature: 0.4
    });

    const response = completion.choices[0]?.message?.content || '{}';
    
    // Clean the response - remove markdown code blocks if present
    let cleanedResponse = response.trim();
    if (cleanedResponse.startsWith('```json')) {
      cleanedResponse = cleanedResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    
    // Parse and validate
    let checklistData;
    try {
      checklistData = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error('Error parsing AI response:', parseError);
      console.error('Raw response:', response);
      console.error('Cleaned response:', cleanedResponse);
      return res.status(500).json({
        success: false,
        message: 'Failed to generate valid checklist. Please try again.',
        error: 'Invalid AI response format'
      });
    }
    
    // Validate structure
    if (!checklistData.eventTitle || !checklistData.categories || !Array.isArray(checklistData.categories)) {
      throw new Error('Invalid AI response structure');
    }

    res.status(200).json({
      success: true,
      checklist: checklistData,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Generate event checklist error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate checklist',
      error: error.message
    });
  }
};

module.exports = {
  vendorChatbot,
  customerChatbot,
  generateOfferings,
  generateDescription,
  generatePackage,
  generateEventChecklist
}; 