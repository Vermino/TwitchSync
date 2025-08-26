// Validation Endpoint Test - Test validation directly without authentication
// This creates a simple endpoint test specifically for validation testing

const axios = require('axios');

const BASE_URL = 'http://localhost:3001';

// Test validation by calling the validation schema directly
// We'll test the actual validation errors that would occur
const testCases = [
  {
    name: 'Valid Rimworld/disnof Task',
    data: {
      name: 'Rimworld VODs - disnof Channel',
      description: 'Download Rimworld VODs from disnof with 1 VOD limit',
      task_type: 'combined',
      channel_ids: [1],
      game_ids: [1], 
      schedule_type: 'manual',
      schedule_value: 'manual',
      priority: 'medium',
      restrictions: {
        maxVodsPerChannel: 1,
        maxTotalVods: 1
      },
      conditions: {
        minDuration: 300,
        requireChat: true
      }
    },
    expectValidationError: false,
    description: 'Should pass validation with valid priority'
  },
  {
    name: 'Invalid Priority Task',
    data: {
      name: 'Invalid Priority Task',
      task_type: 'game',
      schedule_type: 'manual',
      schedule_value: 'manual',
      priority: 'urgent' // Invalid priority
    },
    expectValidationError: true,
    description: 'Should fail validation with invalid priority'
  },
  {
    name: 'Low Priority Task',
    data: {
      name: 'Low Priority Test Task',
      task_type: 'game',
      schedule_type: 'manual',
      schedule_value: 'manual',
      priority: 'low'
    },
    expectValidationError: false,
    description: 'Should pass validation with low priority'
  },
  {
    name: 'High Priority Task', 
    data: {
      name: 'High Priority Test Task',
      task_type: 'game',
      schedule_type: 'manual',
      schedule_value: 'manual',
      priority: 'high'
    },
    expectValidationError: false,
    description: 'Should pass validation with high priority'
  }
];

async function testValidation() {
  console.log('🔍 Testing Task Creation Validation (Without Authentication)\n');
  
  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;

  for (const testCase of testCases) {
    totalTests++;
    console.log(`\n🧪 Test ${totalTests}: ${testCase.name}`);
    console.log(`📝 ${testCase.description}`);
    
    try {
      // Call the API endpoint
      const response = await axios.post(`${BASE_URL}/api/tasks`, testCase.data);
      
      // If we get here without error, validation passed
      if (testCase.expectValidationError) {
        console.log(`❌ FAIL - Expected validation error but request succeeded`);
        console.log(`   Response status: ${response.status}`);
        failedTests++;
      } else {
        // We expect authentication error, not validation error
        console.log(`⚠️  UNEXPECTED - Request succeeded (expected auth error)`);
        console.log(`   Response status: ${response.status}`);
        console.log(`   This might indicate validation passed but auth is bypassed`);
        // We'll count this as a pass for validation purposes
        passedTests++;
      }
      
    } catch (error) {
      if (error.response) {
        const status = error.response.status;
        const errorData = error.response.data;
        
        if (status === 401) {
          // Unauthorized - this means validation passed, auth failed
          if (testCase.expectValidationError) {
            console.log(`❌ FAIL - Expected validation error but got auth error`);
            console.log(`   This suggests validation actually passed for invalid data`);
            failedTests++;
          } else {
            console.log(`✅ PASS - Got auth error as expected (validation passed)`);
            console.log(`   Status: 401 Unauthorized`);
            console.log(`   Validation: PASSED (reached auth layer)`);
            passedTests++;
          }
        } else if (status === 400 && errorData.error === 'Validation failed') {
          // Validation error - this is what we want for invalid data
          if (testCase.expectValidationError) {
            console.log(`✅ PASS - Got validation error as expected`);
            console.log(`   Status: 400 Validation Failed`);
            console.log(`   Error details:`);
            
            // Look for priority-specific validation errors
            if (errorData.details) {
              const priorityError = errorData.details.find(d => 
                d.path && d.path.includes('priority')
              );
              if (priorityError) {
                console.log(`   - Priority validation: ${priorityError.message}`);
                console.log(`   🎯 Priority validation working correctly!`);
              } else {
                console.log(`   - Details: ${JSON.stringify(errorData.details, null, 2)}`);
              }
            }
            passedTests++;
          } else {
            console.log(`❌ FAIL - Got unexpected validation error`);
            console.log(`   Status: 400`);
            console.log(`   Details: ${JSON.stringify(errorData.details, null, 2)}`);
            failedTests++;
          }
        } else {
          console.log(`❌ FAIL - Unexpected error status: ${status}`);
          console.log(`   Error: ${JSON.stringify(errorData, null, 2)}`);
          failedTests++;
        }
      } else {
        console.log(`❌ FAIL - Network or other error: ${error.message}`);
        failedTests++;
      }
    }
  }
  
  // Summary
  console.log(`\n📊 Validation Test Results`);
  console.log(`============================`);
  console.log(`✅ Passed: ${passedTests}`);
  console.log(`❌ Failed: ${failedTests}`);
  console.log(`📈 Total: ${totalTests}`);
  console.log(`🎯 Success Rate: ${Math.round((passedTests / totalTests) * 100)}%`);
  
  console.log(`\n🔍 Analysis:`);
  console.log(`- Valid data should reach authentication layer (401 error)`);
  console.log(`- Invalid data should fail at validation layer (400 error)`);
  console.log(`- Priority validation should reject 'urgent', 'critical', etc.`);
  console.log(`- Priority validation should accept 'low', 'medium', 'high'`);
  
  if (passedTests === totalTests) {
    console.log(`\n🏆 All validation tests passed!`);
    console.log(`✅ Priority enum validation is working correctly`);
    console.log(`✅ Rimworld/disnof scenario validation works`);
    return true;
  } else {
    console.log(`\n🔧 Some validation tests failed`);
    console.log(`❌ Please review the validation schema`);
    return false;
  }
}

// Check if server is running first
async function checkServer() {
  try {
    const response = await axios.get(`${BASE_URL}/health`);
    console.log('✅ Server is running');
    console.log(`📊 Server status: ${JSON.stringify(response.data, null, 2)}`);
    return true;
  } catch (error) {
    console.log('❌ Server is not running or not accessible');
    console.log('Please start the backend server: npm run dev');
    return false;
  }
}

// Main execution
async function main() {
  console.log('🚀 Starting Validation Testing\n');
  
  const serverRunning = await checkServer();
  if (!serverRunning) {
    process.exit(1);
  }
  
  const success = await testValidation();
  
  console.log(`\n🎉 Testing completed!`);
  process.exit(success ? 0 : 1);
}

main().catch(error => {
  console.error('❌ Test execution failed:', error);
  process.exit(1);
});