/**
 * Test runner script for Menu Chatbot
 * Runs tests and provides a summary
 */

require('dotenv').config();
const { spawn } = require('child_process');

console.log('🧪 Running Menu Chatbot Tests...\n');
console.log('='.repeat(60));

const testProcess = spawn('node', ['tests/menuChatbot.test.js'], {
  stdio: 'inherit',
  shell: true
});

testProcess.on('close', (code) => {
  console.log('\n' + '='.repeat(60));
  if (code === 0) {
    console.log('✅ All tests completed successfully!');
  } else {
    console.log(`❌ Tests exited with code ${code}`);
  }
  console.log('='.repeat(60));
  process.exit(code);
});

testProcess.on('error', (error) => {
  console.error('❌ Failed to start test process:', error.message);
  process.exit(1);
});

