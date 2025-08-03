// Debug script to test notification system step by step
// Run this with: node debug-notifications.js

// Using built-in https module instead of node-fetch
const https = require('https');
const http = require('http');

const API_BASE_URL = 'http://localhost:8000/api';

async function testApiHealth() {
  console.log('🔍 Testing API health...');
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ API is healthy:', data.message);
      return true;
    } else {
      console.log('❌ API health check failed:', data);
      return false;
    }
  } catch (error) {
    console.error('❌ Cannot reach API:', error.message);
    return false;
  }
}

async function testNotificationEndpoints() {
  console.log('\n🔍 Testing notification endpoints...');
  
  // Test without authentication (should fail)
  try {
    console.log('📡 Testing GET /notifications without auth...');
    const response = await fetch(`${API_BASE_URL}/notifications`);
    const data = await response.json();
    
    if (response.status === 401) {
      console.log('✅ Endpoint correctly requires authentication');
    } else {
      console.log('⚠️ Unexpected response:', response.status, data);
    }
  } catch (error) {
    console.error('❌ Error testing endpoint:', error.message);
  }
}

async function simulateMessageSend() {
  console.log('\n🔍 Simulating message send to check notification creation...');
  console.log('💡 This requires actual user tokens. Check your browser localStorage for "mahfilToken"');
  console.log('💡 You can copy tokens from logged-in users and paste them below');
}

async function debugNotificationSystem() {
  console.log('🔔 Debug Notification System\n');
  
  // Step 1: Check API health
  const apiHealthy = await testApiHealth();
  if (!apiHealthy) {
    console.log('\n❌ API is not running. Please start your backend with: npm start');
    return;
  }
  
  // Step 2: Test notification endpoints
  await testNotificationEndpoints();
  
  // Step 3: Instructions for manual testing
  await simulateMessageSend();
  
  console.log('\n📋 Manual Testing Steps:');
  console.log('1. Open your frontend app in two browser windows');
  console.log('2. Log in as a customer in one window');
  console.log('3. Log in as a vendor in another window');
  console.log('4. Open the messaging feature');
  console.log('5. Send a message from customer to vendor');
  console.log('6. Check if notification appears in vendor dashboard immediately');
  console.log('7. Open notification dropdown to mark as read');
  console.log('8. Send multiple messages to test multiple notifications');
  
  console.log('\n🔍 Debugging Checklist:');
  console.log('✓ Backend is running');
  console.log('? Frontend notification context is loading');
  console.log('? Socket connection is established');
  console.log('? Message controller creates notifications');
  console.log('? Real-time updates are working');
  
  console.log('\n📊 Check Browser Console for:');
  console.log('• [NotificationContext] logs for API calls');
  console.log('• [NotificationBell] logs for unread count');
  console.log('• [NotificationDropdown] logs for state');
  console.log('• [SocketService] logs for connection');
  console.log('• [NotificationSocket] logs for real-time events');
}

debugNotificationSystem();