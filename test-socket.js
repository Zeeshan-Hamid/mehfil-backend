const io = require('socket.io-client');

// Test socket connection
const testSocketConnection = () => {
  console.log('🧪 Testing socket connection...');
  
  const socket = io('http://localhost:8000', {
    auth: {
      token: 'test-token'
    },
    transports: ['websocket', 'polling'],
    timeout: 5000
  });

  socket.on('connect', () => {
    console.log('✅ Socket connected successfully!');
    console.log('Socket ID:', socket.id);
    socket.disconnect();
  });

  socket.on('connect_error', (error) => {
    console.error('❌ Socket connection error:', error.message);
  });

  socket.on('error', (error) => {
    console.error('❌ Socket error:', error);
  });

  // Timeout after 10 seconds
  setTimeout(() => {
    if (socket.connected) {
      console.log('✅ Test completed successfully');
    } else {
      console.log('❌ Test failed - no connection established');
    }
    socket.disconnect();
    process.exit(0);
  }, 10000);
};

testSocketConnection(); 