const { ChromaClient } = require('chromadb');
const OpenAI = require('openai');
const { getLogger } = require('../config/logging');

const logger = getLogger(__filename);

// Initialize OpenAI client for embeddings
let openai = null;
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

// In-memory vector store fallback (for when ChromaDB server is not available)
const inMemoryStores = new Map(); // sessionId -> { items: [{ id, embedding, metadata, document }] }

/**
 * Calculate cosine similarity between two vectors
 * @param {Array<number>} vecA - First vector
 * @param {Array<number>} vecB - Second vector
 * @returns {number} Cosine similarity score (0-1)
 */
function cosineSimilarity(vecA, vecB) {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have the same length');
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  
  return dotProduct / denominator;
}

// Initialize Chroma client (optional - falls back to in-memory if unavailable)
// Note: Chroma requires a running server. 
// IMPORTANT: Your backend runs on port 8000, so ChromaDB should run on a different port (e.g., 8001)
// For development, you can run:
// docker run -p 8001:8000 chromadb/chroma:latest
// Or: docker run -d -p 8001:8000 --name chroma chromadb/chroma:latest
// Then set CHROMA_URL=http://localhost:8001 in your .env file
let chromaClient = null;
let useChroma = true; // Flag to track if ChromaDB is available

const getChromaClient = () => {
  if (chromaClient) return chromaClient;
  
  // Don't throw error - fall back to in-memory store
  try {
    // Default to port 8001 to avoid conflict with backend (port 8000)
    const chromaUrl = process.env.CHROMA_URL || 'http://localhost:8001';
    
    chromaClient = new ChromaClient({
      path: chromaUrl
    });
    
    logger.info(
      {
        event: 'chroma_client_initialized',
        url: chromaUrl
      },
      'Chroma client initialized'
    );
    useChroma = true;
    return chromaClient;
  } catch (error) {
    logger.warn(
      {
        event: 'chroma_client_init_warning',
        error: {
          type: error?.constructor?.name || 'Error',
          message: error?.message || 'Unknown error',
        },
      },
      'ChromaDB server not available, using in-memory fallback'
    );
    useChroma = false;
    return null;
  }
};

/**
 * Generate embeddings for text using OpenAI
 * @param {string|Array<string>} texts - Text or array of texts to embed
 * @returns {Promise<Array<Array<number>>>} Array of embedding vectors
 */
async function generateEmbeddings(texts) {
  try {
    const openaiClient = getOpenAIClient();
    const textArray = Array.isArray(texts) ? texts : [texts];
    
    const response = await openaiClient.embeddings.create({
      model: 'text-embedding-3-small',
      input: textArray,
    });

    const embeddings = response.data.map(item => item.embedding);
    return Array.isArray(texts) ? embeddings : embeddings[0];
  } catch (error) {
    logger.error(
      {
        event: 'embedding_generation_error',
        error: {
          type: error?.constructor?.name || 'Error',
          message: error?.message || 'Unknown error',
        },
      },
      'Error generating embeddings'
    );
    throw new Error('Failed to generate embeddings: ' + error.message);
  }
}

/**
 * Custom embedding function for ChromaDB that uses OpenAI
 * This class implements the EmbeddingFunction interface for ChromaDB v3
 */
class OpenAIEmbeddingFunction {
  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY;
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
  }

  async embed(texts) {
    try {
      // ChromaDB expects this method to return embeddings
      return await generateEmbeddings(texts);
    } catch (error) {
      logger.error(
        {
          event: 'custom_embedding_function_error',
          error: {
            type: error?.constructor?.name || 'Error',
            message: error?.message || 'Unknown error',
          },
        },
        'Error in custom embedding function'
      );
      throw error;
    }
  }
}

/**
 * Create a new collection for a session
 * @param {string} sessionId - Unique session ID
 * @returns {Promise<Object|null>} Chroma collection or null if using in-memory
 */
async function createSessionCollection(sessionId) {
  // Try ChromaDB first
  if (useChroma) {
    try {
      const client = getChromaClient();
      if (!client) {
        useChroma = false;
        return null;
      }
      
      const collectionName = `menu_chatbot_${sessionId}`;

      // Delete collection if it exists (cleanup)
      try {
        await client.deleteCollection({ name: collectionName });
      } catch (e) {
        // Collection doesn't exist, that's fine
      }

      // Create custom embedding function
      const embeddingFunction = new OpenAIEmbeddingFunction();

      // Create new collection with custom embedding function
      const collection = await client.createCollection({
        name: collectionName,
        embeddingFunction: embeddingFunction,
        metadata: { sessionId, createdAt: new Date().toISOString() }
      });

      logger.info(
        {
          event: 'collection_created',
          sessionId,
          collectionName
        },
        `Created Chroma collection for session: ${sessionId}`
      );

      return collection;
    } catch (error) {
      logger.warn(
        {
          event: 'collection_creation_fallback',
          sessionId,
          error: {
            type: error?.constructor?.name || 'Error',
            message: error?.message || 'Unknown error',
          },
        },
        'ChromaDB unavailable, using in-memory store'
      );
      useChroma = false;
    }
  }
  
  // Fallback to in-memory store
  if (!inMemoryStores.has(sessionId)) {
    inMemoryStores.set(sessionId, { items: [] });
    logger.info(
      {
        event: 'in_memory_store_created',
        sessionId
      },
      `Created in-memory store for session: ${sessionId}`
    );
  }
  return null;
}

/**
 * Get existing collection for a session
 * @param {string} sessionId - Session ID
 * @returns {Promise<Object|null>} Chroma collection or null if not found
 */
async function getSessionCollection(sessionId) {
  // Try ChromaDB first
  if (useChroma) {
    try {
      const client = getChromaClient();
      if (!client) return null;
      
      const collectionName = `menu_chatbot_${sessionId}`;
      const collection = await client.getCollection({ name: collectionName });
      return collection;
    } catch (error) {
      // Collection doesn't exist in ChromaDB, fall back to in-memory
      useChroma = false;
    }
  }
  
  // Check in-memory store
  if (inMemoryStores.has(sessionId)) {
    return null; // Return null but store exists in memory
  }
  
  return null;
}

/**
 * Store menu items in vector database
 * @param {string} sessionId - Session ID
 * @param {Array} menuItems - Array of menu item objects
 * @returns {Promise<void>}
 */
async function storeMenuItems(sessionId, menuItems) {
  try {
    let collection = await getSessionCollection(sessionId);
    
    if (!collection) {
      collection = await createSessionCollection(sessionId);
    }

    if (menuItems.length === 0) {
      logger.warn({ event: 'empty_menu_items', sessionId }, 'No menu items to store');
      return;
    }

    // Prepare documents for embedding
    const documents = menuItems.map(item => {
      // Create a rich text representation for better semantic search
      let doc = `${item.name}`;
      if (item.description) {
        doc += `. ${item.description}`;
      }
      if (item.category) {
        doc += ` [Category: ${item.category}]`;
      }
      if (item.attributes && item.attributes.length > 0) {
        doc += ` [Attributes: ${item.attributes.join(', ')}]`;
      }
      if (item.price) {
        doc += ` [Price: $${item.price}]`;
      }
      return doc;
    });

    // Generate embeddings for all documents
    logger.info(
      {
        event: 'generating_embeddings',
        sessionId,
        itemCount: documents.length
      },
      `Generating embeddings for ${documents.length} menu items`
    );

    const embeddings = await generateEmbeddings(documents);

    // Prepare metadata
    const metadatas = menuItems.map((item, index) => ({
      name: item.name,
      category: item.category || 'Other',
      price: item.price || null,
      attributes: item.attributes || [],
      description: item.description || '',
      index: index
    }));

    // Prepare IDs
    const ids = menuItems.map((item, index) => `${sessionId}_item_${index}`);

    // Store in ChromaDB if available, otherwise use in-memory
    if (collection && useChroma) {
      // Add to ChromaDB collection
      await collection.add({
        ids: ids,
        embeddings: embeddings,
        metadatas: metadatas,
        documents: documents
      });
    } else {
      // Store in-memory
      if (!inMemoryStores.has(sessionId)) {
        inMemoryStores.set(sessionId, { items: [] });
      }
      
      const store = inMemoryStores.get(sessionId);
      for (let i = 0; i < ids.length; i++) {
        store.items.push({
          id: ids[i],
          embedding: embeddings[i],
          metadata: metadatas[i],
          document: documents[i]
        });
      }
      
      logger.info(
        {
          event: 'items_stored_in_memory',
          sessionId,
          itemCount: ids.length
        },
        `Stored ${ids.length} items in in-memory store`
      );
    }

    logger.info(
      {
        event: 'menu_items_stored',
        sessionId,
        itemCount: menuItems.length
      },
      `Stored ${menuItems.length} menu items in vector database`
    );
  } catch (error) {
    logger.error(
      {
        event: 'store_menu_items_error',
        sessionId,
        error: {
          type: error?.constructor?.name || 'Error',
          message: error?.message || 'Unknown error',
        },
      },
      'Error storing menu items'
    );
    throw error;
  }
}

/**
 * Search for similar menu items
 * @param {string} sessionId - Session ID
 * @param {string} query - User query text
 * @param {number} topK - Number of results to return (default: 5)
 * @returns {Promise<Array>} Array of similar menu items with similarity scores
 */
async function searchSimilarItems(sessionId, query, topK = 5) {
  try {
    // Generate embedding for query
    const queryEmbedding = await generateEmbeddings(query);
    
    // Try ChromaDB first
    const collection = await getSessionCollection(sessionId);
    
    if (collection && useChroma) {
      // Search in ChromaDB
      // Ensure queryEmbedding is an array (ChromaDB expects array of arrays)
      const queryEmbeddings = Array.isArray(queryEmbedding[0]) ? queryEmbedding : [queryEmbedding];
      const results = await collection.query({
        queryEmbeddings: queryEmbeddings,
        nResults: topK,
        include: ['metadatas', 'documents', 'distances']
      });

      // Format results
      const items = [];
      if (results.ids && results.ids[0]) {
        for (let i = 0; i < results.ids[0].length; i++) {
          items.push({
            id: results.ids[0][i],
            name: results.metadatas[0][i]?.name || '',
            description: results.metadatas[0][i]?.description || '',
            category: results.metadatas[0][i]?.category || 'Other',
            price: results.metadatas[0][i]?.price || null,
            attributes: results.metadatas[0][i]?.attributes || [],
            document: results.documents[0][i] || '',
            similarity: 1 - (results.distances[0][i] || 0) // Convert distance to similarity
          });
        }
      }
      
      // Search completed - no need to log routine operations

      return items;
    }
    
    // Fallback to in-memory search
    if (!inMemoryStores.has(sessionId)) {
      logger.warn({ event: 'collection_not_found', sessionId }, 'Collection not found for session');
      return [];
    }
    
    const store = inMemoryStores.get(sessionId);
    const itemsWithSimilarity = store.items.map(item => {
      const similarity = cosineSimilarity(queryEmbedding, item.embedding);
      return {
        id: item.id,
        name: item.metadata.name || '',
        description: item.metadata.description || '',
        category: item.metadata.category || 'Other',
        price: item.metadata.price || null,
        attributes: item.metadata.attributes || [],
        document: item.document || '',
        similarity: similarity
      };
    });
    
    // Sort by similarity (descending) and take top K
    itemsWithSimilarity.sort((a, b) => b.similarity - a.similarity);
    const topItems = itemsWithSimilarity.slice(0, topK);
    
    // Search completed - no need to log routine operations

    return topItems;
  } catch (error) {
    logger.error(
      {
        event: 'similarity_search_error',
        sessionId,
        query,
        error: {
          type: error?.constructor?.name || 'Error',
          message: error?.message || 'Unknown error',
        },
      },
      'Error searching for similar items'
    );
    throw error;
  }
}

/**
 * Delete session collection
 * @param {string} sessionId - Session ID
 * @returns {Promise<void>}
 */
async function deleteSessionCollection(sessionId) {
  // Delete from ChromaDB if available
  if (useChroma) {
    try {
      const client = getChromaClient();
      if (client) {
        const collectionName = `menu_chatbot_${sessionId}`;
        await client.deleteCollection({ name: collectionName });
        logger.info(
          {
            event: 'collection_deleted_chroma',
            sessionId,
            collectionName
          },
          `Deleted Chroma collection for session: ${sessionId}`
        );
      }
    } catch (error) {
      // Collection might not exist, that's fine - no need to log
    }
  }
  
  // Delete from in-memory store
  if (inMemoryStores.has(sessionId)) {
    inMemoryStores.delete(sessionId);
    logger.info(
      {
        event: 'collection_deleted_in_memory',
        sessionId
      },
      `Deleted in-memory store for session: ${sessionId}`
    );
  }
}

module.exports = {
  createSessionCollection,
  getSessionCollection,
  storeMenuItems,
  searchSimilarItems,
  deleteSessionCollection,
  generateEmbeddings
};

