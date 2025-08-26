// Debug parameter validation
const { validateParams } = require('./src/middleware/validation.ts');
const { DeleteChannelSchema } = require('./src/routes/channels/validation.ts');

// Simulate a request object like Express would create
const mockReq = {
  params: {
    id: "3"
  }
};

console.log("Testing parameter validation...");
console.log("Mock req.params:", mockReq.params);
console.log("Schema:", DeleteChannelSchema.shape);

console.log("\nTesting DeleteChannelSchema directly:");
try {
  const result = DeleteChannelSchema.parse({ id: "3" });
  console.log("✅ Direct schema validation passed:", result);
} catch (error) {
  console.log("❌ Direct schema validation failed:", error.errors);
}

console.log("\nTesting with req.params:");
try {
  const result = DeleteChannelSchema.parse(mockReq.params);
  console.log("✅ Params validation passed:", result);
} catch (error) {
  console.log("❌ Params validation failed:", error.errors);
}