#!/usr/bin/env node

/**
 * Comprehensive test runner for Menu Chatbot
 * Runs all tests and provides detailed summary
 */

require('dotenv').config();
const { spawn } = require('child_process');

console.log('\n' + '='.repeat(70));
console.log('🧪 MENU CHATBOT - COMPREHENSIVE TEST SUITE');
console.log('='.repeat(70));
console.log('\n');

let testsPassed = 0;
let testsFailed = 0;
const testResults = [];

/**
 * Run a test file and capture results
 */
function runTest(testName, testFile) {
  return new Promise((resolve) => {
    console.log(`\n📋 Running: ${testName}`);
    console.log('-'.repeat(70));

    const testProcess = spawn('node', [testFile], {
      cwd: __dirname + '/..',
      stdio: 'pipe',
      shell: false
    });

    let output = '';
    let errorOutput = '';

    testProcess.stdout.on('data', (data) => {
      output += data.toString();
      // Print non-log output (test results)
      const lines = data.toString().split('\n');
      lines.forEach(line => {
        if (line.trim() && !line.includes('INFO') && !line.includes('WARN') && !line.includes('ERROR') && !line.match(/^\d{4}-\d{2}-\d{2}/)) {
          process.stdout.write(line + '\n');
        }
      });
    });

    testProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
      // Only print errors, not logs
      const lines = data.toString().split('\n');
      lines.forEach(line => {
        if (line.includes('ERROR') || line.includes('Error:') || line.includes('FAILED')) {
          process.stderr.write(line + '\n');
        }
      });
    });

    testProcess.on('close', (code) => {
      // Parse test results
      const passedMatch = output.match(/# pass (\d+)/);
      const failMatch = output.match(/# fail (\d+)/);
      const totalMatch = output.match(/# tests (\d+)/);
      const skippedMatch = output.match(/# skipped (\d+)/);

      const passed = passedMatch ? parseInt(passedMatch[1]) : 0;
      const failed = failMatch ? parseInt(failMatch[1]) : 0;
      const total = totalMatch ? parseInt(totalMatch[1]) : 0;
      const skipped = skippedMatch ? parseInt(skippedMatch[1]) : 0;

      testsPassed += passed;
      testsFailed += failed;

      testResults.push({
        name: testName,
        passed,
        failed,
        total,
        skipped,
        success: code === 0 && failed === 0
      });

      if (code === 0 && failed === 0) {
        console.log(`✅ ${testName}: ${passed}/${total} tests passed${skipped > 0 ? ` (${skipped} skipped)` : ''}`);
      } else {
        console.log(`❌ ${testName}: ${failed} failed, ${passed} passed`);
      }

      resolve();
    });

    testProcess.on('error', (error) => {
      console.error(`❌ Failed to run ${testName}:`, error.message);
      testResults.push({
        name: testName,
        passed: 0,
        failed: 1,
        total: 1,
        skipped: 0,
        success: false
      });
      testsFailed += 1;
      resolve();
    });
  });
}

/**
 * Main test runner
 */
async function runAllTests() {
  const startTime = Date.now();

  // Check prerequisites
  console.log('📦 Checking prerequisites...\n');
  
  if (!process.env.OPENAI_API_KEY) {
    console.log('⚠️  WARNING: OPENAI_API_KEY not set - some embedding tests will be skipped\n');
  } else {
    console.log('✅ OPENAI_API_KEY is set\n');
  }

  // Run unit tests
  await runTest('Unit Tests', 'tests/menuChatbot.test.js');

  // Summary
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('\n' + '='.repeat(70));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(70));

  testResults.forEach(result => {
    const status = result.success ? '✅' : '❌';
    console.log(`${status} ${result.name}: ${result.passed} passed, ${result.failed} failed, ${result.skipped} skipped`);
  });

  console.log('\n' + '-'.repeat(70));
  console.log(`Total: ${testsPassed} passed, ${testsFailed} failed`);
  console.log(`Duration: ${duration}s`);
  console.log('='.repeat(70));

  // Final status
  if (testsFailed === 0) {
    console.log('\n✅ ALL TESTS PASSED!\n');
    process.exit(0);
  } else {
    console.log('\n❌ SOME TESTS FAILED\n');
    process.exit(1);
  }
}

// Run tests
runAllTests().catch(error => {
  console.error('\n❌ Fatal error running tests:', error);
  process.exit(1);
});

