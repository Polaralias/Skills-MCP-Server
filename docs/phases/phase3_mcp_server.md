# Phase 3: MCP Server & Tools

## Overview

This phase involves setting up the MCP server instance and registering the tools that expose the skills and search functionality.

## Steps

1.  **Implement Server Factory**
    -   In `src/server.ts`, create `createMcpServer(skills: Skill[])`.
    -   Initialize `McpServer` from `@modelcontextprotocol/sdk/server/mcp.js`.

2.  **Register Skill Tools**
    -   Iterate through the `skills` array.
    -   For each skill, register a tool named `skill_<id>`.
    -   **Tool Metadata:**
        -   Title: `skill.title`
        -   Description: `skill.description`
    -   **Tool Execution:**
        -   Return `content`: `[{ type: "text", text: skill.content }]`
        -   Return `data`: Metadata object (id, title, description, tags).

3.  **Register Search Tool**
    -   Register tool `search_skills`.
    -   **Input Schema (Zod):**
        -   `query`: string (required)
        -   `limit`: number (optional, default 5)
    -   **Tool Execution:**
        -   Call `searchSkills(skills, query, limit)`.
        -   Return a summary text string (e.g., "Found X primary matches...").
        -   Return structured data with `primaryMatches` and `alternativeMatches`.

## Success Criteria
-   `createMcpServer` returns a configured `McpServer` instance.
-   All skills are registered as individual tools.
-   `search_skills` tool is registered and callable.
