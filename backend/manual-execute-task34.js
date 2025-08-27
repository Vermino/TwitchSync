// Manually execute task 34 to test the filtering
const axios = require('axios');

async function manualExecuteTask34() {
  try {
    console.log('Manually triggering task 34 execution...');
    
    // We need to authenticate first - let's try a simple approach
    // by directly calling the task execution endpoint
    const response = await axios.post('http://localhost:3001/api/tasks/34/run', {}, {
      headers: {
        'Content-Type': 'application/json',
        // Add any required auth headers if needed
      }
    });
    
    console.log('Response:', response.status, response.data);
    
  } catch (error) {
    if (error.response) {
      console.error('Error response:', error.response.status, error.response.data);
    } else {
      console.error('Error:', error.message);
    }
  }
}

manualExecuteTask34().catch(console.error);