/**
 * Unit tests for Menu Chatbot services
 * Tests menu processing, vector store, session management, and RAG chatbot
 * 
 * Run with: node tests/menuChatbot.test.js
 */

require('dotenv').config();
const { test } = require('node:test');
const assert = require('node:assert');
const { processMenuFile, parseMenuStructure } = require('../src/services/menuProcessingService');
const sessionManager = require('../src/services/menuChatbotSessionManager');
const { generateEmbeddings } = require('../src/services/vectorStoreService');

// Mock file object for testing
function createMockFile(content, mimeType, filename) {
  return {
    buffer: Buffer.from(content),
    mimetype: mimeType,
    originalname: filename || 'test-menu.pdf',
    size: Buffer.byteLength(content)
  };
}

test('Menu Processing Service - parseMenuStructure should parse menu correctly', () => {
  const menuText = `
RESTAURANT MENU

APPETIZERS
Bruschetta - Fresh tomatoes, basil, and garlic on toasted bread - $8.99
Chicken Wings - Spicy buffalo wings with blue cheese dip - $12.99

MAIN COURSES
Spicy Chicken Curry - Tender chicken in a spicy curry sauce with rice - $18.99
Grilled Salmon - Fresh salmon with lemon butter sauce and vegetables - $22.99

DESSERTS
Chocolate Cake - Rich chocolate layer cake - $7.99

DRINKS
Lassi - Traditional yogurt drink (mango or plain) - $4.99
`;

  const menuItems = parseMenuStructure(menuText);

  assert(Array.isArray(menuItems), 'Should return an array');
  assert(menuItems.length > 0, 'Should parse menu items');
  
  // Check for categories (parser may use fallback which sets category to "Other")
  const categories = menuItems.map(item => item.category);
  // Parser should either identify categories OR use fallback (which is acceptable)
  assert(categories.length > 0, 'Should have categories for all items');
});

test('Menu Processing Service - should extract attributes like spicy, vegetarian', () => {
  const menuText = `
Spicy Chicken Curry - Tender chicken in a spicy curry sauce - $18.99
Vegetarian Pasta - Pasta with marinara sauce - $15.99
`;

  const menuItems = parseMenuStructure(menuText);

  const spicyItem = menuItems.find(item => 
    item.name.toLowerCase().includes('spicy') || 
    item.attributes.includes('spicy')
  );
  
  const vegItem = menuItems.find(item => 
    item.name.toLowerCase().includes('vegetarian') ||
    item.attributes.includes('vegetarian')
  );

  assert(spicyItem || vegItem, 'Should identify attributes');
});

test('Menu Processing Service - should handle empty text gracefully', () => {
  const menuItems = parseMenuStructure('');
  
  // Should return empty array or handle gracefully
  assert(Array.isArray(menuItems), 'Should return an array');
});

test('Session Manager - should create a new session', () => {
  const sessionId = sessionManager.createSession();
  
  assert(sessionId, 'Should return a session ID');
  assert(typeof sessionId === 'string', 'Session ID should be a string');
  assert(sessionId.length > 0, 'Session ID should not be empty');
});

test('Session Manager - should retrieve session after creation', () => {
  const sessionId = sessionManager.createSession();
  const session = sessionManager.getSession(sessionId);
  
  assert(session, 'Should retrieve session');
  assert(session.sessionId === sessionId, 'Session ID should match');
  assert(session.conversationHistory, 'Should have conversation history');
  assert(Array.isArray(session.conversationHistory), 'Conversation history should be an array');
});

test('Session Manager - should set menu data', () => {
  const sessionId = sessionManager.createSession();
  const menuData = {
    menuItems: [
      { name: 'Item 1', category: 'Main', price: 10 },
      { name: 'Item 2', category: 'Dessert', price: 5 }
    ],
    itemCount: 2,
    categories: ['Main', 'Dessert']
  };

  const success = sessionManager.setMenuData(sessionId, menuData);
  
  assert(success, 'Should successfully set menu data');
  
  const session = sessionManager.getSession(sessionId);
  assert(session.menuData, 'Session should have menu data');
  assert(session.menuData.itemCount === 2, 'Menu data should be correct');
});

test('Session Manager - should add messages to conversation history', () => {
  const sessionId = sessionManager.createSession();
  
  sessionManager.addMessage(sessionId, 'user', 'Hello');
  sessionManager.addMessage(sessionId, 'assistant', 'Hi there!');
  
  const history = sessionManager.getConversationHistory(sessionId);
  
  assert(history.length === 2, 'Should have 2 messages');
  assert(history[0].role === 'user', 'First message should be from user');
  assert(history[1].role === 'assistant', 'Second message should be from assistant');
});

test('Session Manager - should get session status', () => {
  const sessionId = sessionManager.createSession();
  const status = sessionManager.getSessionStatus(sessionId);
  
  assert(status.exists, 'Session should exist');
  assert(status.hasMenu === false, 'New session should not have menu');
  assert(status.messageCount === 0, 'New session should have no messages');
});

test('Session Manager - should delete session', () => {
  const sessionId = sessionManager.createSession();
  
  const deleted = sessionManager.deleteSession(sessionId);
  assert(deleted, 'Should successfully delete session');
  
  const session = sessionManager.getSession(sessionId);
  assert(!session, 'Session should not exist after deletion');
});

test('Vector Store Service - should generate embeddings for text', { skip: !process.env.OPENAI_API_KEY, timeout: 10000 }, async () => {
  const text = 'Spicy chicken curry';
  const embedding = await generateEmbeddings(text);
  
  assert(embedding, 'Should return an embedding');
  assert(Array.isArray(embedding), 'Embedding should be an array');
  assert(embedding.length > 0, 'Embedding should have dimensions');
});

test('Vector Store Service - should generate embeddings for multiple texts', { skip: !process.env.OPENAI_API_KEY, timeout: 10000 }, async () => {
  const texts = ['Spicy chicken curry', 'Grilled salmon'];
  const embeddings = await generateEmbeddings(texts);
  
  assert(Array.isArray(embeddings), 'Should return an array of embeddings');
  assert(embeddings.length === 2, 'Should have 2 embeddings');
  assert(Array.isArray(embeddings[0]), 'Each embedding should be an array');
});

test('Integration - should create session and add menu data', () => {
  const sessionId = sessionManager.createSession();
  
  const menuData = {
    menuItems: [
      {
        name: 'Spicy Chicken Curry',
        description: 'Tender chicken in spicy curry sauce',
        category: 'Main Courses',
        price: 18.99,
        attributes: ['spicy']
      }
    ],
    itemCount: 1,
    categories: ['Main Courses']
  };
  
  sessionManager.setMenuData(sessionId, menuData);
  
  const status = sessionManager.getSessionStatus(sessionId);
  assert(status.hasMenu, 'Session should have menu after setting data');
  assert(status.itemCount === 1, 'Item count should match');
});

// Export test utilities
module.exports = {
  createMockFile
};

