# OpenAI Agent SDK - Quick Reference

## Endpoint
```
POST /api/agent/chat
```

## Authentication
- **Required:** Bearer token (vendor role)
- **Rate Limit:** 10 requests/minute per user

## Request Format
```json
{
  "message": "What are users searching for?",
  "conversationHistory": [] // optional
}
```

## Response Format
```json
{
  "success": true,
  "response": "Formatted markdown response from agent",
  "toolsUsed": ["analyze_search_logs"],
  "timestamp": "2025-11-22T12:00:00.000Z"
}
```

## Available Tools

### 1. analyze_search_logs
Analyzes search patterns and trends
- Top 50 search queries
- Week-over-week trends
- New vs trending searches
- User type breakdown

### 2. get_vendor_analytics
Provides platform insights
- Profile optimization tips
- Booking best practices
- Customer engagement strategies

## Example Queries

**Search Insights:**
- "What are users searching for?"
- "Show me trending searches"
- "What services are in demand?"

**Business Advice:**
- "How can I optimize my profile?"
- "How do I get more bookings?"
- "What are the best practices?"

## Files Created

**Backend:**
- `src/services/agentService.js` - Agent with tools
- `src/controllers/agentController.js` - Request handler
- `src/utils/searchLogHelpers.js` - DB queries
- `src/routes/api/agentRoutes.js` - Routes + rate limiting

**Frontend:**
- Updated `VendorChatbot.js` to use `/api/agent/chat`

## Testing

Start server:
```bash
npm run dev
```

Test as vendor:
1. Login to vendor dashboard
2. Click AI Assistant (floating button)
3. Ask about search trends or optimization tips
