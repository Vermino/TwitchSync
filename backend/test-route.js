const express = require('express');
const { validateParams } = require('./src/middleware/validation.ts');
const { DeleteChannelSchema } = require('./src/routes/channels/validation.ts');

const app = express();
app.use(express.json());

// Test route that mimics the DELETE /api/channels/:id route
app.delete('/test/:id', 
  validateParams(DeleteChannelSchema),
  (req, res) => {
    res.json({ success: true, id: req.params.id });
  }
);

// Error handler
app.use((err, req, res, next) => {
  console.log('Error caught:', err.message);
  res.status(err.statusCode || 500).json({
    error: err.message,
    details: err.details
  });
});

const port = 3002;
app.listen(port, () => {
  console.log(`Test server running on port ${port}`);
});