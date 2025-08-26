#!/usr/bin/env node

/**
 * Test script to verify task execution flow
 * This script will simulate activating a task and check if downloads begin
 */

const axios = require('axios');

const API_BASE = 'http://localhost:3001/api';
const AUTH_BASE = 'http://localhost:3001/auth';

async function testTaskExecution() {
    try {
        console.log('🧪 Testing Task Execution Flow...\n');
        
        // First, let's get auth token
        console.log('1. Getting auth token...');
        const authResponse = await axios.post(`${AUTH_BASE}/login`, {
            email: 'test@example.com',
            password: 'password123'
        });
        
        if (!authResponse.data.token) {
            throw new Error('No token received from auth');
        }
        
        const token = authResponse.data.token;
        const headers = { Authorization: `Bearer ${token}` };
        console.log('✅ Auth token obtained\n');
        
        // Get list of tasks
        console.log('2. Getting list of tasks...');
        const tasksResponse = await axios.get(`${API_BASE}/tasks`, { headers });
        console.log(`Found ${tasksResponse.data.length} tasks:`);
        
        tasksResponse.data.forEach(task => {
            console.log(`  - Task ${task.id}: ${task.name} (${task.status}, active: ${task.is_active})`);
        });
        
        if (tasksResponse.data.length === 0) {
            console.log('❌ No tasks found. Please create a task first.');
            return;
        }
        
        // Pick the first task to test
        const testTask = tasksResponse.data[0];
        console.log(`\n3. Testing execution of Task ${testTask.id}: ${testTask.name}`);
        
        // Check current status
        console.log(`Current task status: ${testTask.status}, active: ${testTask.is_active}`);
        
        // Activate the task if it's not already running
        if (testTask.status !== 'running' || !testTask.is_active) {
            console.log('4. Activating task...');
            
            try {
                const activationResponse = await axios.post(`${API_BASE}/tasks/${testTask.id}/run`, {}, { headers });
                console.log('✅ Task activation request sent');
                console.log('Response:', activationResponse.data);
            } catch (error) {
                console.error('❌ Task activation failed:', error.response?.data || error.message);
                return;
            }
        } else {
            console.log('Task is already running');
        }
        
        // Wait a moment for processing to start
        console.log('\n5. Waiting 3 seconds for processing to start...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Check task details after activation
        console.log('6. Checking task details after activation...');
        const detailsResponse = await axios.get(`${API_BASE}/tasks/${testTask.id}/details`, { headers });
        console.log('Task details:', JSON.stringify(detailsResponse.data, null, 2));
        
        // Check queue status
        console.log('\n7. Checking download queue status...');
        try {
            const queueResponse = await axios.get(`${API_BASE}/downloads/queue/status`, { headers });
            console.log('Queue status:', JSON.stringify(queueResponse.data, null, 2));
        } catch (error) {
            console.log('Could not get queue status (endpoint may not exist)');
        }
        
        console.log('\n🎉 Task execution test completed!');
        console.log('Check the backend logs to see if VOD discovery and downloads are happening.');
        
    } catch (error) {
        console.error('❌ Test failed:', error.response?.data || error.message);
        if (error.response?.status === 401) {
            console.log('💡 Tip: Make sure you have a user created with email "test@example.com" and password "password123"');
        }
    }
}

// Run the test
testTaskExecution();