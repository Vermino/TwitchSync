#!/usr/bin/env node

/**
 * Test script to verify specific task execution
 */

const axios = require('axios');

const API_BASE = 'http://localhost:3001/api';

async function testSpecificTask() {
    try {
        console.log('🧪 Testing Specific Task Execution...\n');
        
        // Generate test JWT token
        console.log('1. Generating test JWT token...');
        const jwt = require('jsonwebtoken');
        const JWT_SECRET = 'development-jwt-secret-key-change-in-production';
        const payload = {
            userId: 1,
            twitchId: 'test_user_id', 
            username: 'test_user'
        };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
        const headers = { Authorization: `Bearer ${token}` };
        console.log('✅ Test token generated\n');
        
        const taskId = 4; // Test with Task 4 which we fixed
        
        console.log(`2. Testing execution of Task ${taskId}...`);
        
        // First reset task status to pending 
        console.log('Resetting task status to pending...');
        await axios.put(`${API_BASE}/tasks/${taskId}`, {
            status: 'pending',
            is_active: false
        }, { headers });
        
        // Wait a moment
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Now activate the task
        console.log('3. Activating task...');
        const activationResponse = await axios.post(`${API_BASE}/tasks/${taskId}/run`, {}, { headers });
        console.log('✅ Task activation request sent');
        console.log('Response status:', activationResponse.data.status);
        
        // Wait for processing
        console.log('\n4. Waiting 5 seconds for VOD discovery to complete...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Check results
        console.log('5. Checking results...');
        const detailsResponse = await axios.get(`${API_BASE}/tasks/${taskId}/details`, { headers });
        console.log('Task status:', detailsResponse.data.status);
        console.log('Monitoring status:', detailsResponse.data.monitoring_status);
        console.log('Progress:', detailsResponse.data.progress_percentage + '%');
        
        console.log('\n🎉 Test completed! Check the backend logs and database for VODs.');
        
    } catch (error) {
        console.error('❌ Test failed:', error.response?.data || error.message);
    }
}

// Run the test
testSpecificTask();