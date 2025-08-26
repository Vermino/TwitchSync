// Simple validation test script
const { CreateChannelSchema } = require('./src/routes/channels/validation.ts');

// Test data that should pass validation
const validData = {
  twitch_id: "123456",
  username: "testuser",
  display_name: "Test User",
  profile_image_url: "https://example.com/image.jpg",
  description: "Test channel description",
  follower_count: 1000,
  is_active: true
};

// Test data that should fail validation
const invalidData = {
  twitch_id: "", // Empty string should fail
  username: "a".repeat(101), // Too long should fail
  follower_count: -5 // Negative should fail
};

console.log("Testing channel validation...\n");

console.log("Testing valid data:");
try {
  const result = CreateChannelSchema.parse(validData);
  console.log("✅ Valid data passed validation:", result);
} catch (error) {
  console.log("❌ Valid data failed validation:", error.errors);
}

console.log("\nTesting invalid data:");
try {
  const result = CreateChannelSchema.parse(invalidData);
  console.log("❌ Invalid data incorrectly passed validation:", result);
} catch (error) {
  console.log("✅ Invalid data correctly failed validation:");
  error.errors.forEach(err => {
    console.log(`  - ${err.path.join('.')}: ${err.message}`);
  });
}