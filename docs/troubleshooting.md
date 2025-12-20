# Troubleshooting

## 401 Unauthorized Error on Smithery

If you encounter a `401 Unauthorized` error when accessing your deployed MCP server on Smithery, especially from clients like ChatGPT, this is typically due to **Smithery's platform authentication**.

### Symptoms
- Error message: `Client error '401 Unauthorized' for url 'https://server.smithery.ai/@YourUser/skills-mcp-server'`
- Response headers containing `www-authenticate: Bearer error="invalid_token", ... resource_metadata=".../oauth-protected-resource/..."`

### Cause
By default, deployments on Smithery (especially "Custom Container" deployments) are protected by Smithery's OAuth layer. This means that any request to the server URL must include a valid Authorization token issued by Smithery.

### Resolution

#### Option 1: Configure Client Authentication
If you are using a client that supports OAuth (like the Smithery ChatGPT Plugin), ensure you have logged in or provided the necessary credentials.

#### Option 2: Make Deployment Public
If you intend for the server to be publicly accessible without authentication (e.g., for use with a custom ChatGPT Action that doesn't support the specific OAuth flow):
1. Go to your **Smithery Dashboard**.
2. Navigate to your server's settings.
3. Look for "Access Control" or "Visibility" settings.
4. Change the setting to **Public** (if available).

*Note: The server code itself (`src/httpApp.ts`) does not enforce authentication, but the Smithery proxy layer in front of it does.*
