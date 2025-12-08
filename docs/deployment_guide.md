# Deployment Guide for Skills MCP Server

This guide provides step-by-step instructions to deploy the Skills MCP Server to Smithery as a custom container.

## Prerequisites

1.  **Smithery Account**: You need an account on Smithery.
2.  **Container Registry**: A container registry (e.g., GitHub Container Registry, Docker Hub) to host your Docker image.
3.  **Docker**: Installed locally to build and push the image.

## Step 1: Build and Push Docker Image

1.  **Login to your container registry** (e.g., for GitHub Container Registry):
    ```bash
    echo $CR_PAT | docker login ghcr.io -u USERNAME --password-stdin
    ```

2.  **Build the Docker image**:
    Replace `<registry>/<namespace>` with your actual registry and namespace (e.g., `ghcr.io/my-username`).
    ```bash
    docker build -t <registry>/<namespace>/skills-mcp-server:latest .
    ```

3.  **Push the image**:
    ```bash
    docker push <registry>/<namespace>/skills-mcp-server:latest
    ```
    *Note the full image reference URL, you will need it for Smithery.*

## Step 2: Configure Smithery

1.  Go to the Smithery web UI and create a new server.
2.  Select **"Custom Container"** as the deployment type.

## Step 3: Server Configuration

Fill in the configuration details:

*   **Container Image**: The full URL of the image you just pushed (e.g., `ghcr.io/my-username/skills-mcp-server:latest`).
*   **Registry Credentials**: If your registry is private, provide the necessary credentials.

## Step 4: Port and Endpoint Configuration

*   **Internal Container Port**: `8080` (This matches the `PORT` in the Dockerfile).
*   **MCP Path**: `/mcp` (This is the endpoint served by the Express app).

## Step 5: Environment Variables

Set the following environment variables in the Smithery configuration:

*   `TRANSPORT`: `http`
*   `PORT`: `8080`
*   `SKILLS_DIR`: `/app/skills` (Default location in the container).

## Step 6: Metadata

*   **Name**: `Skills MCP Server`
*   **Description**: `MCP server exposing markdown-based skills as tools.`
*   **Tags**: `skills`, `documentation`, `knowledge-base`

## Step 7: Verify Deployment

Once deployed, use the Smithery playground to test the server:

1.  Call `search_skills` with a query like "android" or "design".
2.  Verify it returns relevant skills.
3.  Call a specific skill tool (e.g., `skill_android-dev-standards`) and verify it returns the content.
