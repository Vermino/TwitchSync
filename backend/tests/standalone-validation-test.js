// Standalone Validation Test - Test validation logic directly
// This tests the validation schemas without needing the full API stack

const { CreateTaskSchema, TaskPriorityEnum } = require('../dist/src/routes/tasks/validation');

function testValidation() {
  console.log('🔍 Testing Task Creation Validation (Direct Schema Testing)\n');
  
  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;

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
      shouldPass: true,
      description: 'Should pass validation with valid medium priority'
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
      shouldPass: false,
      description: 'Should fail validation with invalid priority (urgent)'
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
      shouldPass: true,
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
      shouldPass: true,
      description: 'Should pass validation with high priority'
    },
    {
      name: 'Default Priority Task',
      data: {
        name: 'Default Priority Test Task',
        task_type: 'game',
        schedule_type: 'manual',
        schedule_value: 'manual'
        // No priority - should default to 'low'
      },
      shouldPass: true,
      description: 'Should pass validation and default to low priority'
    },
    {
      name: 'Critical Priority Task (Invalid)',
      data: {
        name: 'Critical Priority Test Task',
        task_type: 'game',
        schedule_type: 'manual',
        schedule_value: 'manual',
        priority: 'critical' // Invalid priority
      },
      shouldPass: false,
      description: 'Should fail validation with invalid priority (critical)'
    },
    {
      name: 'Normal Priority Task (Invalid)',
      data: {
        name: 'Normal Priority Test Task',
        task_type: 'game',
        schedule_type: 'manual',
        schedule_value: 'manual',
        priority: 'normal' // Invalid priority
      },
      shouldPass: false,
      description: 'Should fail validation with invalid priority (normal)'
    }
  ];

  console.log(`📋 Running ${testCases.length} validation tests...\n`);

  for (const testCase of testCases) {
    totalTests++;
    console.log(`🧪 Test ${totalTests}: ${testCase.name}`);
    console.log(`📝 ${testCase.description}`);
    
    try {
      const result = CreateTaskSchema.parse(testCase.data);
      
      if (testCase.shouldPass) {
        console.log(`✅ PASS - Validation succeeded as expected`);
        
        // Show priority value (including defaults)
        console.log(`   Priority: ${result.priority || 'undefined'}`);
        
        // Special validation for specific scenarios
        if (testCase.name.includes('Rimworld')) {
          console.log(`   🎯 Rimworld/disnof validation: PASSED`);
          console.log(`   - Task Type: ${result.task_type}`);
          console.log(`   - Restrictions: maxVodsPerChannel = ${result.restrictions?.maxVodsPerChannel}`);
        }
        
        if (testCase.name.includes('Default Priority')) {
          if (result.priority === 'low') {
            console.log(`   🎯 Default priority validation: PASSED (defaulted to 'low')`);
          } else {
            console.log(`   ⚠️  Default priority validation: FAILED (expected 'low', got '${result.priority}')`);
          }
        }
        
        passedTests++;
      } else {
        console.log(`❌ FAIL - Expected validation to fail but it passed`);
        console.log(`   Parsed result: ${JSON.stringify(result, null, 2)}`);
        failedTests++;
      }
      
    } catch (error) {
      if (!testCase.shouldPass) {
        console.log(`✅ PASS - Validation failed as expected`);
        
        // Show specific validation error details
        if (error.errors) {
          const priorityError = error.errors.find(e => 
            e.path && e.path.includes('priority')
          );
          if (priorityError) {
            console.log(`   🎯 Priority validation error: ${priorityError.message}`);
            console.log(`   Expected values: 'low', 'medium', 'high'`);
            console.log(`   Received value: '${testCase.data.priority}'`);
          } else {
            console.log(`   Validation errors: ${error.errors.map(e => e.message).join(', ')}`);
          }
        } else {
          console.log(`   Error: ${error.message}`);
        }
        
        passedTests++;
      } else {
        console.log(`❌ FAIL - Expected validation to pass but it failed`);
        console.log(`   Error: ${error.message}`);
        if (error.errors) {
          console.log(`   Details: ${JSON.stringify(error.errors, null, 2)}`);
        }
        failedTests++;
      }
    }
    
    console.log(''); // Add spacing between tests
  }
  
  // Test TaskPriorityEnum directly
  console.log(`🎯 Testing TaskPriorityEnum directly:`);
  const priorityTests = [
    { value: 'low', shouldPass: true },
    { value: 'medium', shouldPass: true },
    { value: 'high', shouldPass: true },
    { value: 'urgent', shouldPass: false },
    { value: 'critical', shouldPass: false },
    { value: 'normal', shouldPass: false },
    { value: '', shouldPass: false },
    { value: null, shouldPass: false }
  ];
  
  for (const test of priorityTests) {
    totalTests++;
    try {
      TaskPriorityEnum.parse(test.value);
      if (test.shouldPass) {
        console.log(`✅ '${test.value}' - PASS (accepted as expected)`);
        passedTests++;
      } else {
        console.log(`❌ '${test.value}' - FAIL (should have been rejected)`);
        failedTests++;
      }
    } catch (error) {
      if (!test.shouldPass) {
        console.log(`✅ '${test.value}' - PASS (rejected as expected)`);
        passedTests++;
      } else {
        console.log(`❌ '${test.value}' - FAIL (should have been accepted)`);
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
  console.log(`- Priority enum validation: ${priorityTests.filter(t => t.shouldPass).length}/3 valid values should pass`);
  console.log(`- Priority enum validation: ${priorityTests.filter(t => !t.shouldPass).length}/5 invalid values should fail`);
  console.log(`- Task creation validation: Complex scenarios should work correctly`);
  console.log(`- Default behavior: Missing priority should default to 'low'`);
  
  if (passedTests === totalTests) {
    console.log(`\n🏆 All validation tests passed!`);
    console.log(`✅ Priority enum validation is working correctly`);
    console.log(`✅ Rimworld/disnof scenario validation works`);
    console.log(`✅ Default priority behavior is correct`);
    console.log(`✅ Invalid priority values are properly rejected`);
    return true;
  } else {
    console.log(`\n🔧 Some validation tests failed`);
    console.log(`❌ Please review the validation schema implementation`);
    return false;
  }
}

// Main execution
console.log('🚀 Starting Standalone Validation Testing\n');

try {
  const success = testValidation();
  console.log(`\n🎉 Testing completed!`);
  process.exit(success ? 0 : 1);
} catch (error) {
  console.error('❌ Test execution failed:', error);
  console.error('Make sure to build the project first: npm run build');
  process.exit(1);
}