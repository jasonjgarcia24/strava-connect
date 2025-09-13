const { HfInference } = require('@huggingface/inference');
const TokenManager = require('./src/tokenManager');
const SecureEncryption = require('./utils/encryptUtils.js');
const { InferenceClient } = require('@huggingface/inference');

async function testHuggingFaceAPI() {
  console.log('🧪 Testing Hugging Face API...\n');
  
  // Load the API key
  const tokenManager = new TokenManager('huggingface');
  const tokens = tokenManager.loadTokens();
  const apiKey = tokens?.private_key;
  
  if (!apiKey) {
    console.error('❌ No Hugging Face API key found in tokens.json');
    return;
  }
  
  // Initialize encryption and HuggingFace client
  const encryption = new SecureEncryption('huggingface');
  const decryptedKey = encryption.decrypt(apiKey);
  const hf = new InferenceClient(decryptedKey);
  
  console.log('✅ API key found and HuggingFace client initialized');
  
  // Test different models
  const model = 'meta-llama/Llama-4-Maverick-17B-128E-Instruct';
  
  const testPrompt = "Please summarize this training note: I ran 5 miles today. My legs felt good but my right ankle was a bit sore from yesterday's hike.";
  
  console.log(`\n🔄 Testing model: ${model}`);
  console.log('─'.repeat(60));
  
  try {
    // Try chat completion method
    console.log('📝 Testing chat completion...');
    const response = await hf.chatCompletion({
      model: model,
      messages: [
        {
          role: "user",
          content: testPrompt
        }
      ],
      max_tokens: 300,
      temperature: 0.7
    });
    
    console.log('✅ Chat completion works!');
    console.log('📝 Response:', response);
    console.log('Response message:', response.choices[0].message.content);
    
    // Test with system message for better training analysis
    console.log('\n🔄 Testing with system message...');
    const systemResponse = await hf.chatCompletion({
      model: model,
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that analyzes athletic training notes and provides insights about patterns, recovery, and performance trends."
        },
        {
          role: "user",
          content: "Please analyze this training note: " + testPrompt
        }
      ],
      max_tokens: 400,
      temperature: 0.7
    });
    
    console.log('✅ System message works!');
    console.log('📝 System Response:', systemResponse);
    
  } 
  catch (error) {
    console.log('❌ Model failed:');
    console.log(`   Error: ${error.message}`);
    
    if (error.message.includes('Model not found')) {
      console.log('   ℹ️  Model not found via Inference API');
    } else if (error.message.includes('loading')) {
      console.log('   ℹ️  Model might be loading, try again in a few minutes');
    } else if (error.message.includes('401')) {
      console.log('   ℹ️  Authentication issue - check API key or model access');
    }
  }
  
  // Clean up encryption
  encryption.destroy();
  
  console.log('\n🎯 Test completed!');
  console.log('\nNext steps:');
  console.log('- Use a model that returned ✅ "Model available!"');
  console.log('- Check the response format to understand how to parse the output');
}

// Run the test
testHuggingFaceAPI().catch(error => {
  console.error('❌ Test script failed:', error.message);
});