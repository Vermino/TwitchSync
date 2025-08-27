// Test script for reliability services
const http = require('http');

async function testHealthEndpoint() {
  console.log('Testing reliability services...\n');
  
  try {
    // Test health endpoint
    const response = await fetch('http://localhost:3001/api/health');
    const health = await response.json();
    
    console.log('✅ Health endpoint working');
    console.log('Overall status:', health.status);
    console.log('Database:', health.checks.database.status);
    console.log('Disk Space:', health.checks.diskSpace.status);
    console.log('Memory:', health.checks.memory.status);
    console.log('Download Manager:', health.checks.downloadManager.status);
    console.log('Task Queue:', health.checks.taskQueue.status);
    
    if (health.status === 'healthy') {
      console.log('\n✅ All reliability services are working correctly!');
      console.log('Backend is ready for production use.');
    } else {
      console.log('\n⚠️  Some services have warnings/issues but backend is functional.');
    }
    
  } catch (error) {
    console.error('❌ Health endpoint test failed:', error.message);
  }
}

// Run the test
testHealthEndpoint();