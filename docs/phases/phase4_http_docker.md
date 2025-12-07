# Phase 4: HTTP Transport & Docker

## Overview

This phase wraps the MCP server in an Express HTTP server for deployment and creates the Docker container configuration.

## Steps

1.  **Implement Express App**
    -   In `src/httpApp.ts`, implement `startHttpServer()`.
    -   Setup Express app with `cors` and `express.json()`.
    -   **Endpoint `/mcp`:**
        -   Load skills (cache the promise so it's only loaded once).
        -   Create `McpServer`.
        -   Create `StreamableHTTPServerTransport`.
        -   Connect server to transport: `await server.connect(transport)`.
        -   Handle request: `await transport.handleRequest(req, res, req.body)`.
        -   Clean up on close.
    -   Start listening on `PORT`.

2.  **Entry Point**
    -   In `src/index.ts`:
        -   Read `TRANSPORT` env var.
        -   If `http`, call `startHttpServer()`.
        -   Throw error if other transport (unless implementing stdio for local dev).

3.  **Dockerfile**
    -   Create `Dockerfile` in root.
    -   Base image: `node:22-slim`.
    -   Workdir: `/app`.
    -   Copy `package*.json` -> `npm ci`.
    -   Copy source -> `npm run build`.
    -   Set env: `TRANSPORT=http`, `PORT=8080`.
    -   Expose 8080.
    -   CMD: `node dist/index.js`.

4.  **Local Verification**
    -   Run `npm run build`.
    -   Run `TRANSPORT=http npm start` (or `npm run dev`).
    -   Verify server starts and listens on port 8080.
    -   (Optional) Use `npx @modelcontextprotocol/inspector` (if supported) or a simple curl to check `/mcp` (note: `/mcp` expects MCP JSON-RPC messages, so a GET might just 404 or 405, or hang waiting for connection).

## Success Criteria
-   Server starts successfully via `npm start`.
-   Docker build succeeds (`docker build .`).
-   Container runs and exposes port 8080.
