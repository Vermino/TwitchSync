import axios from 'axios';

async function test() {
    try {
        const res = await axios.get('http://localhost:3501/recommendations/channels?min_viewers=100&max_viewers=50000&languages=en&confidence_threshold=0.7', {
            headers: {
                // Find a valid user ID or we'll just get 401. Let's send a fake auth header or something. Wait, the endpoint uses `authenticate(pool)`.
            }
        });
        console.log(res.data);
    } catch (e: any) {
        if (e.response) {
            console.log('Error data:', e.response.data);
        } else {
            console.error(e);
        }
    }
}

test();
