# RAG Restaurant Menu Chatbot

A Retrieval-Augmented Generation (RAG) based chatbot system that helps customers find menu items based on their preferences. Users upload restaurant menus (PDF or images), and the chatbot uses OpenAI embeddings and GPT to provide intelligent recommendations.

## Features

- **Menu Upload**: Support for PDF and image files (JPG, PNG, GIF, WebP)
- **Text Extraction**: Automatic text extraction from PDFs and OCR from images
- **Smart Recommendations**: AI-powered suggestions based on user queries
- **Context Awareness**: Maintains conversation context within a session
- **Complementary Suggestions**: Automatically recommends drinks and desserts with main courses
- **Session-Based**: In-memory sessions that clear on server restart

## Prerequisites

1. **Node.js** (v18 or higher)
2. **OpenAI API Key** - Required for embeddings and chat generation
3. **Chroma Server** (optional but recommended) - For vector storage

## Setup

### 1. Environment Variables

Add to your `.env` file:

```env
OPENAI_API_KEY=your_openai_api_key_here
CHROMA_URL=http://localhost:8001  # Optional, defaults to localhost:8001 (backend uses port 8000)
```

**Important**: Your backend runs on port 8000, so ChromaDB must use a different port (8001).

### 2. Install Dependencies

Dependencies are already installed:
- `chromadb` - Vector database client
- `pdf-parse` - PDF text extraction
- `tesseract.js` - OCR for images

### 3. Start Chroma Server (Required)

**IMPORTANT**: Since your backend runs on port 8000, ChromaDB must run on a different port.

For best performance, run Chroma server using Docker on port 8001:

```bash
# Run ChromaDB on port 8001 (to avoid conflict with backend on port 8000)
docker run -d -p 8001:8000 --name chroma chromadb/chroma:latest
```

Or if you prefer to stop/start it easily:
```bash
docker run -p 8001:8000 chromadb/chroma:latest
```

**Note**: 
- ChromaDB will run on port 8001 (maps to internal port 8000)
- Your backend runs on port 8000
- The default `CHROMA_URL` is already set to `http://localhost:8001`
- Vector storage **requires** a running Chroma server

## API Endpoints

### Create Session
```
POST /api/menu-chatbot/session
Response: { success: true, sessionId: "..." }
```

### Upload Menu
```
POST /api/menu-chatbot/upload
Content-Type: multipart/form-data
Body: {
  sessionId: "optional",
  menu: <file>
}
Response: { success: true, sessionId: "...", data: {...} }
```

### Chat
```
POST /api/menu-chatbot/chat
Body: {
  sessionId: "required",
  message: "What spicy options do you have?"
}
Response: { success: true, response: "...", sessionId: "..." }
```

### Get Session Status
```
GET /api/menu-chatbot/session/:sessionId/status
Response: { success: true, status: {...} }
```

### Clear Session
```
DELETE /api/menu-chatbot/session/:sessionId
Response: { success: true, message: "..." }
```

## Usage Example

1. **Create a session**:
   ```bash
   curl -X POST http://localhost:8000/api/menu-chatbot/session
   ```

2. **Upload a menu**:
   ```bash
   curl -X POST http://localhost:8000/api/menu-chatbot/upload \
     -F "sessionId=YOUR_SESSION_ID" \
     -F "menu=@menu.pdf"
   ```

3. **Ask questions**:
   ```bash
   curl -X POST http://localhost:8000/api/menu-chatbot/chat \
     -H "Content-Type: application/json" \
     -d '{
       "sessionId": "YOUR_SESSION_ID",
       "message": "What spicy main courses do you have?"
     }'
   ```

## Testing

### Unit Tests

Run unit tests (tests services directly):
```bash
node tests/menuChatbot.test.js
```

**Note**: Some tests require `OPENAI_API_KEY` to be set and will be skipped if not available.

### Integration Tests

Start the server first, then run:
```bash
node tests/test-menu-chatbot-integration.js
```

This tests the full API workflow:
- Session creation
- Session status checking
- Chat functionality (requires menu upload)

## Architecture

### Components

1. **Menu Processing Service** (`menuProcessingService.js`)
   - Extracts text from PDFs and images
   - Parses menu structure
   - Identifies categories and attributes

2. **Vector Store Service** (`vectorStoreService.js`)
   - Generates embeddings using OpenAI
   - Stores embeddings in Chroma
   - Performs similarity search

3. **RAG Chatbot Service** (`ragChatbotService.js`)
   - Maintains conversation context
   - Retrieves relevant menu items
   - Generates intelligent responses
   - Provides complementary recommendations

4. **Session Manager** (`menuChatbotSessionManager.js`)
   - Manages in-memory sessions
   - Stores menu data and conversation history
   - Auto-cleanup on timeout (30 minutes)

## Recommendation Logic

The chatbot automatically provides complementary recommendations:

- **Spicy food** → Recommends cooling drinks (lassi, lemonade) and desserts
- **Main courses** → Suggests appetizers, drinks, and desserts
- **Vegetarian options** → Suggests vegetarian items across all categories
- **Appetizers** → Suggests main courses and drinks

## Session Management

- Sessions are stored in-memory (cleared on server restart)
- Session timeout: 30 minutes of inactivity
- Auto-cleanup runs every 5 minutes
- Each session can store one menu and conversation history

## Troubleshooting

### Chroma Connection Error

If you see "Failed to initialize Chroma client":
1. **Ensure ChromaDB is running on port 8001** (your backend uses port 8000):
   ```bash
   docker run -d -p 8001:8000 --name chroma chromadb/chroma:latest
   ```
2. Check if ChromaDB is running: `docker ps` (should show a chroma container)
3. Check `CHROMA_URL` environment variable (defaults to `http://localhost:8001`)
4. Test ChromaDB connection: `curl http://localhost:8001/api/v1/heartbeat`
5. If using Docker, restart: `docker restart chroma` or `docker start chroma`

### OpenAI API Errors

- Ensure `OPENAI_API_KEY` is set in `.env`
- Check API key validity and quota

### OCR/Text Extraction Issues

- PDF text extraction works well with text-based PDFs
- OCR on images requires clear, readable text
- Image quality affects OCR accuracy

## Limitations

1. **In-Memory Storage**: Sessions and data are lost on server restart
2. **Chroma Dependency**: Vector storage requires running Chroma server
3. **OCR Accuracy**: Image OCR depends on image quality
4. **Menu Parsing**: Complex menu layouts may need manual adjustment

## Future Enhancements

- Persistent session storage (database)
- Multiple menu support per session
- Enhanced menu parsing with ML
- Support for more file formats
- User preferences learning

## License

ISC

