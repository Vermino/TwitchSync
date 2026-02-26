import { DiscoveryPreferencesSchema } from './src/routes/discovery/validation';

try {
    DiscoveryPreferencesSchema.parse({
        min_viewers: 100,
        max_viewers: 50000,
        preferred_languages: ['en'],
        tags: [],
        confidence_threshold: 0.7
    });
    console.log("Validation PASSED");
} catch (e) {
    console.log("Validation FAILED:", JSON.stringify(e, null, 2));
}
