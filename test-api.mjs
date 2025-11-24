import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.argv[2];

if (!apiKey) {
    console.error("Usage: node test-api.mjs YOUR_API_KEY");
    process.exit(1);
}
const genAI = new GoogleGenerativeAI(apiKey);

async function testAllModels() {
    const modelsToTest = [
        "gemini-pro",
        "gemini-1.5-pro",
        "gemini-1.5-flash",
        "gemini-1.5-pro-latest",
        "gemini-1.5-flash-latest"
    ];

    for (const modelName of modelsToTest) {
        try {
            console.log(`\nTesting ${modelName}...`);
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent("Say hello in one word");
            const response = await result.response;
            const text = response.text();
            console.log(`✓ SUCCESS with ${modelName}!`);
            console.log(`Response: ${text}`);
            break; // Stop after first success
        } catch (error) {
            console.log(`✗ Failed with ${modelName}`);
            console.log(`Error: ${error.message}`);
        }
    }
}

testAllModels();
