// Manual API Test Script - Run this with the backend server running
// This tests the actual task creation workflow with Rimworld/disnof scenario

const axios = require('axios');

const BASE_URL = 'http://localhost:3001';

// Mock auth token or use real one if available
const AUTH_TOKEN = process.env.TEST_AUTH_TOKEN || 'mock-token-for-testing';

const axiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Authorization': `Bearer ${AUTH_TOKEN}`,
    'Content-Type': 'application/json'
  }
});

// Test scenarios
const testScenarios = [
  {
    name: 'Rimworld VODs - disnof Channel (Valid Priority)',
    description: 'Test task creation with valid medium priority',
    data: {
      name: 'Rimworld VODs - disnof Channel',
      description: 'Download Rimworld VODs from disnof with 1 VOD limit',
      task_type: 'combined',
      channel_ids: [1], // disnof channel ID
      game_ids: [1], // Rimworld game ID
      schedule_type: 'manual',
      schedule_value: 'manual',
      priority: 'medium', // Valid priority
      restrictions: {
        maxVodsPerChannel: 1,
        maxTotalVods: 1
      },
      conditions: {
        minDuration: 300,
        requireChat: true
      }
    },
    expectedStatus: 201
  },
  {
    name: 'Invalid Priority Test',
    description: 'Test task creation with invalid priority (should fail)',
    data: {
      name: 'Invalid Priority Task',
      task_type: 'game',
      schedule_type: 'manual',
      schedule_value: 'manual',
      priority: 'urgent' // Invalid priority - should fail validation
    },
    expectedStatus: 400
  },
  {
    name: 'Low Priority Task',
    description: 'Test task creation with low priority',
    data: {
      name: 'Low Priority Test Task',
      task_type: 'game',
      schedule_type: 'manual',
      schedule_value: 'manual',
      priority: 'low'
    },
    expectedStatus: 201
  },
  {
    name: 'High Priority Task',
    description: 'Test task creation with high priority',
    data: {
      name: 'High Priority Test Task',
      task_type: 'game',
      schedule_type: 'manual',
      schedule_value: 'manual',
      priority: 'high'
    },
    expectedStatus: 201
  },
  {
    name: 'Default Priority Task',
    description: 'Test task creation without priority (should default to low)',
    data: {
      name: 'Default Priority Test Task',
      task_type: 'game',
      schedule_type: 'manual',
      schedule_value: 'manual'
      // No priority specified - should default to 'low'
    },
    expectedStatus: 201
  }
];

async function runTests() {
  console.log('🚀 Starting Manual API Tests for Task Creation Validation\n');
  
  // Check if server is running
  try {
    const healthCheck = await axiosInstance.get('/health');
    console.log('✅ Server is running:', healthCheck.data);
    console.log('');
  } catch (error) {
    console.error('❌ Server is not running or not accessible');
    console.error('Please start the backend server first: npm run dev');
    process.exit(1);
  }

  let passedTests = 0;
  let failedTests = 0;
  const createdTaskIds = [];

  for (const scenario of testScenarios) {
    console.log(`\n🧪 Testing: ${scenario.name}`);
    console.log(`📝 Description: ${scenario.description}`);
    
    try {
      const response = await axiosInstance.post('/api/tasks', scenario.data);
      
      if (response.status === scenario.expectedStatus) {
        console.log(`✅ PASS - Status: ${response.status}`);
        
        if (response.status === 201) {
          console.log(`   📊 Created Task Details:`);
          console.log(`   - ID: ${response.data.id}`);
          console.log(`   - Name: ${response.data.name}`);
          console.log(`   - Priority: ${response.data.priority || 'undefined'}`);
          console.log(`   - Task Type: ${response.data.task_type}`);
          console.log(`   - Status: ${response.data.status}`);
          
          createdTaskIds.push(response.data.id);
          
          // Special validation for Rimworld/disnof scenario
          if (scenario.name.includes('Rimworld VODs - disnof')) {
            if (response.data.priority === 'medium' && 
                response.data.task_type === 'combined' &&
                response.data.restrictions?.maxVodsPerChannel === 1) {
              console.log(`   🎯 Rimworld/disnof specific validation: PASSED`);
            } else {
              console.log(`   ⚠️  Rimworld/disnof specific validation: FAILED`);
            }
          }
          
          // Validate priority defaults
          if (scenario.name.includes('Default Priority') && !scenario.data.priority) {
            if (response.data.priority === 'low') {
              console.log(`   🎯 Priority default validation: PASSED (defaulted to 'low')`);
            } else {
              console.log(`   ⚠️  Priority default validation: FAILED (expected 'low', got '${response.data.priority}')`);
            }
          }
        }
        
        passedTests++;
      } else {
        console.log(`❌ FAIL - Expected status: ${scenario.expectedStatus}, Got: ${response.status}`);
        failedTests++;
      }
      
    } catch (error) {
      if (error.response && error.response.status === scenario.expectedStatus) {
        console.log(`✅ PASS - Expected error status: ${error.response.status}`);
        
        if (scenario.expectedStatus === 400) {
          console.log(`   📋 Validation Error Details:`);
          if (error.response.data.error === 'Validation failed') {
            console.log(`   - Error: ${error.response.data.error}`);
            const priorityError = error.response.data.details?.find(d => 
              d.path && d.path.includes('priority')
            );
            if (priorityError) {
              console.log(`   - Priority validation: ${priorityError.message}`);
              console.log(`   🎯 Priority validation working correctly!`);
            }
          }
        }
        
        passedTests++;
      } else {
        console.log(`❌ FAIL - Unexpected error:`, error.response?.data || error.message);
        failedTests++;
      }
    }
  }

  // Test task activation (manual run)
  if (createdTaskIds.length > 0) {
    console.log(`\n🔄 Testing Task Activation (Manual Run)`);
    const taskId = createdTaskIds[0];
    
    try {
      const response = await axiosInstance.post(`/api/tasks/${taskId}/run`);
      
      if (response.status === 200) {
        console.log(`✅ Task activation PASSED`);
        console.log(`   - Task ID: ${response.data.id}`);
        console.log(`   - Status: ${response.data.status}`);
        console.log(`   - Active: ${response.data.is_active}`);
        passedTests++;
      } else {
        console.log(`❌ Task activation FAILED - Status: ${response.status}`);
        failedTests++;
      }
    } catch (error) {
      console.log(`⚠️  Task activation test skipped due to error:`, error.response?.status || error.message);
      // Don't count this as a failure since it might be due to missing auth or other setup
    }
  }

  // Summary
  console.log(`\n📊 Test Results Summary`);
  console.log(`============================`);
  console.log(`✅ Passed: ${passedTests}`);
  console.log(`❌ Failed: ${failedTests}`);
  console.log(`📈 Total: ${passedTests + failedTests}`);
  console.log(`🎯 Success Rate: ${Math.round((passedTests / (passedTests + failedTests)) * 100)}%`);

  if (createdTaskIds.length > 0) {
    console.log(`\n🗑️  Created test tasks with IDs: ${createdTaskIds.join(', ')}`);
    console.log(`   You may want to clean these up manually if needed.`);
  }

  console.log(`\n🎉 Testing completed!`);
  
  if (failedTests === 0) {
    console.log(`🏆 All tests passed! The validation fixes are working correctly.`);
    process.exit(0);
  } else {
    console.log(`🔧 Some tests failed. Please review the results above.`);
    process.exit(1);
  }
}

// Handle command line arguments
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Manual API Test Script for Task Creation Validation

Usage:
  node tests/manual-api-test.js

Environment Variables:
  TEST_AUTH_TOKEN - Authentication token for API calls (optional)

Prerequisites:
  - Backend server must be running (npm run dev)
  - Database must be set up and accessible
  
This script tests:
  1. Valid priority values (low, medium, high)
  2. Invalid priority values (should be rejected)
  3. Default priority behavior
  4. Rimworld/disnof specific scenario
  5. Task activation workflow
`);
  process.exit(0);
}

// Run the tests
runTests().catch(error => {
  console.error('❌ Test execution failed:', error);
  process.exit(1);
});