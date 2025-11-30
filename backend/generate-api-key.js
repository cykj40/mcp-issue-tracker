import { auth } from './dist/auth.js';

async function generateApiKey() {
  try {
    // Generate a new API key for oger's user ID
    const userId = 'fL6Wk0rVEj9j2fUBj16erXoEjxYKft2x'; // oger's user ID

    const result = await auth.api.createApiKey({
      body: {
        name: 'MCP Server API Key',
        userId: userId,
        metadata: {
          createdAt: new Date().toISOString(),
          purpose: 'mcp-server',
        },
      },
    });

    console.log('\n=== NEW API KEY GENERATED ===');
    console.log('API Key:', result.key);
    console.log('Key ID:', result.id);
    console.log('Prefix:', result.start);
    console.log('User ID:', userId);
    console.log('\nIMPORTANT: Save this API key now - it cannot be retrieved again!');
    console.log('Full key:', result.key);
    console.log('=============================\n');

    process.exit(0);
  } catch (error) {
    console.error('Error generating API key:', error);
    process.exit(1);
  }
}

generateApiKey();
