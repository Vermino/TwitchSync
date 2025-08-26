#!/usr/bin/env node

/**
 * Complete workflow test - creates a task with channels and tests execution
 */

const axios = require('axios');
const jwt = require('jsonwebtoken');

const API_BASE = 'http://localhost:3001/api';

async function testCompleteWorkflow() {
    try {
        console.log('🔄 Testing Complete Task Workflow...\n');
        
        // Generate test JWT token
        console.log('1. Generating test JWT token...');
        const JWT_SECRET = 'development-jwt-secret-key-change-in-production';
        const payload = { userId: 1, twitchId: 'test_user_id', username: 'test_user' };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
        const headers = { Authorization: `Bearer ${token}` };
        console.log('✅ Test token generated\n');
        
        // Check if we have channels in the database
        console.log('2. Checking available channels...');
        const channelsResponse = await axios.get(`${API_BASE}/channels`, { headers });
        console.log(`Found ${channelsResponse.data.length} channels:`);
        
        if (channelsResponse.data.length === 0) {
            console.log('❌ No channels found. Adding a test channel...');
            
            // Add a test channel
            try {
                const newChannelResponse = await axios.post(`${API_BASE}/channels`, {
                    username: 'disnof',
                    twitch_id: '85660645',
                    is_favorite: true
                }, { headers });
                console.log('✅ Test channel added:', newChannelResponse.data);
            } catch (channelError) {
                console.log('Channel creation failed:', channelError.response?.data || channelError.message);
            }
        } else {
            channelsResponse.data.forEach(channel => {
                console.log(`  - ${channel.username} (${channel.twitch_id})`);
            });
        }
        
        // Get channels again to ensure we have at least one
        const updatedChannelsResponse = await axios.get(`${API_BASE}/channels`, { headers });
        if (updatedChannelsResponse.data.length === 0) {
            console.log('❌ Still no channels available. Cannot proceed.');
            return;
        }
        
        const testChannel = updatedChannelsResponse.data[0];
        console.log(`\n3. Using channel: ${testChannel.username} (ID: ${testChannel.id})`);
        
        // Create a new task with this channel
        console.log('4. Creating task with channel...');
        const taskData = {
            name: `Workflow Test Task - ${Date.now()}`,
            description: 'Test task for complete workflow',
            task_type: 'channel',
            channel_ids: [testChannel.id],
            game_ids: [],
            schedule_type: 'manual',
            schedule_value: 'manual',
            priority: 'medium',
            is_active: false  // Start inactive
        };
        
        const createTaskResponse = await axios.post(`${API_BASE}/tasks`, taskData, { headers });
        const newTask = createTaskResponse.data;
        console.log(`✅ Task created: ${newTask.name} (ID: ${newTask.id})`);
        
        // Activate the task
        console.log('\n5. Activating task for execution...');
        const activationResponse = await axios.post(`${API_BASE}/tasks/${newTask.id}/run`, {}, { headers });
        console.log('✅ Task activation initiated');
        console.log('Task status:', activationResponse.data.status);
        
        // Wait and check progress
        console.log('\n6. Monitoring task progress...');
        for (let i = 0; i < 6; i++) {
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
            
            const progressResponse = await axios.get(`${API_BASE}/tasks/${newTask.id}/details`, { headers });
            const task = progressResponse.data;
            
            console.log(`  Check ${i + 1}: Status = ${task.status}, Progress = ${task.progress_percentage}%`);
            console.log(`    Monitoring: ${task.monitoring_status || 'N/A'}`);
            
            if (task.status === 'completed' || task.status === 'failed') {
                break;
            }
        }
        
        // Check final queue status
        console.log('\n7. Checking final download queue status...');
        const finalQueueResponse = await axios.get(`${API_BASE}/downloads/queue/status`, { headers });
        console.log('Final queue status:', JSON.stringify(finalQueueResponse.data, null, 2));
        
        // Check for any VODs that were queued
        console.log('\n8. Summary:');
        const finalTaskResponse = await axios.get(`${API_BASE}/tasks/${newTask.id}/details`, { headers });
        const finalTask = finalTaskResponse.data;
        console.log(`  Final task status: ${finalTask.status}`);
        console.log(`  Final progress: ${finalTask.progress_percentage}%`);
        console.log(`  Queue pending: ${finalTask.queueStatus.pending}`);
        console.log(`  Queue downloading: ${finalTask.queueStatus.downloading}`);
        console.log(`  Queue completed: ${finalTask.queueStatus.completed}`);
        console.log(`  Queue failed: ${finalTask.queueStatus.failed}`);
        
        console.log('\n🎉 Complete workflow test finished!');
        
        if (finalTask.queueStatus.pending > 0 || finalTask.queueStatus.downloading > 0) {
            console.log('✅ SUCCESS: VODs were discovered and queued for download!');
        } else {
            console.log('⚠️  No VODs were queued - this may be expected if the channel has no recent VODs');
        }
        
    } catch (error) {
        console.error('❌ Workflow test failed:', error.response?.data || error.message);
        if (error.response?.status === 404) {
            console.log('💡 Make sure the backend server is running on http://localhost:3001');
        }
    }
}

// Run the test
testCompleteWorkflow();