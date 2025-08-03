// Test script to create sample notifications for testing
// Run this with: node test-notifications.js

const API_BASE_URL = 'http://localhost:8000/api';

// Sample user tokens (you'll need to replace these with actual tokens from your app)
// You can get these from localStorage in browser after logging in
const CUSTOMER_TOKEN = 'your_customer_token_here';
const VENDOR_TOKEN = 'your_vendor_token_here';

// Sample user IDs (you'll need to replace these with actual user IDs)
const CUSTOMER_ID = 'your_customer_id_here';
const VENDOR_ID = 'your_vendor_id_here';

async function createTestNotification(recipientId, token, title, message, type = 'message') {
  try {
    const response = await fetch(`${API_BASE_URL}/notifications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        recipientId: recipientId,
        type: type,
        title: title,
        message: message,
        data: {
          testData: true,
          timestamp: new Date().toISOString()
        }
      })
    });

    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ Notification created successfully:', data);
    } else {
      console.log('❌ Failed to create notification:', data);
    }
    
    return data;
  } catch (error) {
    console.error('❌ Error creating notification:', error);
  }
}

async function testNotifications() {
  console.log('🔔 Testing Notification System...\n');

  // Test notification to customer
  console.log('📨 Creating test notification for customer...');
  await createTestNotification(
    CUSTOMER_ID,
    VENDOR_TOKEN,
    'New Message from Vendor',
    'A vendor has sent you a message regarding your booking request.',
    'message'
  );

  // Wait a bit
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Test notification to vendor
  console.log('📨 Creating test notification for vendor...');
  await createTestNotification(
    VENDOR_ID,
    CUSTOMER_TOKEN,
    'New Booking Inquiry',
    'A customer has sent you a booking inquiry for your services.',
    'booking'
  );

  // Create multiple notifications to test real-time updates
  console.log('📨 Creating multiple notifications for real-time test...');
  
  for (let i = 1; i <= 3; i++) {
    await createTestNotification(
      VENDOR_ID,
      CUSTOMER_TOKEN,
      `Message ${i}`,
      `This is test message number ${i} from the customer.`,
      'message'
    );
    
    // Small delay between notifications
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n✅ Test notifications created! Check your app to see if they appear in real-time.');
  console.log('\n📝 Instructions:');
  console.log('1. Make sure your backend is running on http://localhost:8000');
  console.log('2. Replace the token and user ID placeholders in this script with real values');
  console.log('3. Open your frontend app and check the notification bell');
  console.log('4. Notifications should appear in real-time without page refresh');
  console.log('5. Opening the notification dropdown should mark them as read');
}

// Instructions for getting tokens and user IDs
console.log('📋 Before running this test:');
console.log('1. Start your backend server');
console.log('2. Log into your app as both a customer and vendor');
console.log('3. Open browser dev tools and check localStorage for "mahfilToken"');
console.log('4. Check the Network tab or console logs for user IDs');
console.log('5. Update the token and ID variables in this script');
console.log('6. Run: node test-notifications.js\n');

// Uncomment the line below when you have updated the tokens and IDs
// testNotifications();

console.log('⚠️  Please update the tokens and user IDs in this script before running the test.');