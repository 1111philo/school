import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.argv[2];

if (!apiKey) {
    console.error("Usage: node list-models.js YOUR_API_KEY");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

async function listModels() {
    try {
        const models = await genAI.listModels();
        console.log("Available models:");
        for await (const model of models) {
            console.log(`\n- ${model.name}`);
            console.log(`  Display Name: ${model.displayName}`);
            console.log(`  Supported Methods: ${model.supportedGenerationMethods?.join(', ')}`);
        }
    } catch (error) {
        console.error("Error listing models:", error);
    }
}

listModels();
