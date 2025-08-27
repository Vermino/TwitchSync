# Queue Management API Documentation

## Base URL
All queue endpoints are prefixed with `/api/queue`

## Authentication
All endpoints require authentication via Bearer token in the Authorization header:
```
Authorization: Bearer <jwt_token>
```

## Endpoints

### 1. Get Active Download Queue

**GET** `/api/queue`

Get the current download queue (pending, queued, downloading items only).

**Query Parameters:**
- `status` (optional): Comma-separated status filters (default: "pending,queued,downloading")
- `limit` (optional): Number of items to return (default: 50, max: 500)
- `offset` (optional): Offset for pagination (default: 0)

**Example Request:**
```bash
GET /api/queue?status=pending,queued&limit=20&offset=0
```

**Response:**
```json
{
  "items": [
    {
      "id": 123,
      "title": "Stream Title",
      "download_status": "queued",
      "download_priority": "high",
      "queue_position": 2,
      "task_name": "My Task",
      "channel_name": "streamer_name",
      "created_at": "2025-08-27T10:00:00Z",
      "download_progress": 0,
      "estimated_size": 1024000000
    }
  ],
  "total": 15
}
```

### 2. Get Queue History

**GET** `/api/queue/history`

Get completed and failed downloads.

**Query Parameters:**
- `status` (optional): Comma-separated status filters (default: "completed,failed")
- `limit` (optional): Number of items to return (default: 50)
- `offset` (optional): Offset for pagination (default: 0)
- `task_id` (optional): Filter by specific task ID

**Example Request:**
```bash
GET /api/queue/history?status=completed&limit=10&task_id=5
```

**Response:**
```json
{
  "items": [
    {
      "id": 456,
      "title": "Completed Stream",
      "download_status": "completed",
      "actual_completed_at": "2025-08-27T09:30:00Z",
      "actual_file_size": 987654321,
      "download_speed_mbps": 25.5,
      "download_duration_seconds": 45,
      "task_name": "My Task",
      "channel_name": "streamer_name"
    }
  ],
  "total": 8
}
```

### 3. Get Queue Statistics

**GET** `/api/queue/stats`

Get comprehensive queue statistics.

**Query Parameters:**
- `task_id` (optional): Get stats for specific task only

**Response:**
```json
{
  "pending": 5,
  "queued": 3,
  "downloading": 2,
  "completed": 15,
  "failed": 1,
  "total_size_bytes": 5368709120,
  "avg_download_speed": 18.7
}
```

### 4. Update VOD Priority

**PATCH** `/api/queue/:id/priority`

Update the priority of a VOD in the queue.

**URL Parameters:**
- `id`: VOD ID

**Request Body:**
```json
{
  "priority": "high"
}
```

**Valid priorities:** `low`, `normal`, `high`, `critical`

**Response:**
```json
{
  "message": "VOD priority updated successfully",
  "vod": {
    "id": 123,
    "download_priority": "high",
    "updated_at": "2025-08-27T10:15:00Z"
  }
}
```

### 5. Bulk Update Priorities

**PATCH** `/api/queue/bulk/priority`

Update multiple VOD priorities at once.

**Request Body:**
```json
{
  "updates": [
    { "vod_id": 123, "priority": "high" },
    { "vod_id": 124, "priority": "critical" },
    { "vod_id": 125, "priority": "low" }
  ]
}
```

**Response:**
```json
{
  "message": "Bulk priority update completed",
  "updated": 3,
  "results": [
    { "id": 123, "download_priority": "high" },
    { "id": 124, "download_priority": "critical" },
    { "id": 125, "download_priority": "low" }
  ]
}
```

### 6. Retry Failed Download

**POST** `/api/queue/:id/retry`

Retry a failed download.

**URL Parameters:**
- `id`: VOD ID

**Request Body:**
```json
{
  "reset_retry_count": false
}
```

**Response:**
```json
{
  "message": "VOD retry initiated successfully",
  "vod": {
    "id": 123,
    "download_status": "pending",
    "retry_count": 2,
    "error_message": null
  }
}
```

### 7. Move VOD to Top of Queue

**POST** `/api/queue/:id/move-top`

Move a VOD to the top of the queue (sets priority to critical).

**Response:**
```json
{
  "message": "VOD moved to top of queue",
  "vod": {
    "id": 123,
    "download_priority": "critical"
  }
}
```

### 8. Move VOD to Bottom of Queue

**POST** `/api/queue/:id/move-bottom`

Move a VOD to the bottom of the queue (sets priority to low).

**Response:**
```json
{
  "message": "VOD moved to bottom of queue",
  "vod": {
    "id": 123,
    "download_priority": "low"
  }
}
```

### 9. Clear Completed VODs

**DELETE** `/api/queue/history/completed`

Remove all completed VODs from the history.

**Query Parameters:**
- `task_id` (optional): Clear only completed VODs for specific task

**Response:**
```json
{
  "message": "Cleared 15 completed VODs from history",
  "deleted": 15
}
```

### 10. Get Queue Estimate

**GET** `/api/queue/estimate`

Get estimated completion time for the current queue.

**Query Parameters:**
- `task_id` (optional): Get estimate for specific task only

**Response:**
```json
{
  "estimatedMinutes": 45,
  "totalItems": 8
}
```

## Error Responses

All endpoints return consistent error responses:

**400 Bad Request:**
```json
{
  "error": "Validation failed",
  "details": [
    {
      "msg": "Priority must be one of: low, normal, high, critical",
      "param": "priority",
      "location": "body"
    }
  ]
}
```

**401 Unauthorized:**
```json
{
  "error": "Unauthorized"
}
```

**404 Not Found:**
```json
{
  "error": "VOD not found or access denied"
}
```

**500 Internal Server Error:**
```json
{
  "error": "Failed to fetch download queue"
}
```

## Usage Examples

### Frontend Queue Display
```javascript
// Get active queue
const queueResponse = await fetch('/api/queue?limit=20', {
  headers: { Authorization: `Bearer ${token}` }
});
const { items: queueItems, total } = await queueResponse.json();

// Display queue with positions
queueItems.forEach(item => {
  console.log(`${item.queue_position}. [${item.download_priority.toUpperCase()}] ${item.title}`);
});
```

### Priority Management
```javascript
// Move important VOD to top
await fetch(`/api/queue/${vodId}/move-top`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` }
});

// Bulk update priorities
await fetch('/api/queue/bulk/priority', {
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  },
  body: JSON.stringify({
    updates: selectedVods.map(vod => ({
      vod_id: vod.id,
      priority: 'high'
    }))
  })
});
```

### Queue Monitoring
```javascript
// Get real-time statistics
const statsResponse = await fetch('/api/queue/stats', {
  headers: { Authorization: `Bearer ${token}` }
});
const stats = await statsResponse.json();

console.log(`Queue: ${stats.pending} pending, ${stats.downloading} downloading`);
console.log(`Completed: ${stats.completed} (${(stats.total_size_bytes / 1024 / 1024 / 1024).toFixed(2)} GB)`);
```

## Integration Notes

1. **Real-time Updates**: Consider using WebSocket connections or polling for live queue status
2. **Pagination**: Use `limit` and `offset` for large queues
3. **Error Handling**: Always handle network errors and display user-friendly messages
4. **Status Filtering**: Use status filters to separate active queue from history
5. **Priority Visual Indicators**: Show priority levels with colors or icons
6. **Progress Tracking**: Use `download_progress` field for progress bars
7. **Bulk Operations**: Implement multi-select for bulk priority updates