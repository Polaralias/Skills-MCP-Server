# Technical Specification: Skills MCP Server (Smithery Custom Container)

## 1. Overview

This document specifies the design and build process for a TypeScript-based MCP server that:

- Exposes a collection of skills defined as `SKILL.md` files in a `skills/` directory.
- Automatically registers a dedicated MCP tool for each discovered skill.
- Exposes a `search_skills` tool that performs keyword search across all skills and returns the most relevant matches.
- Runs as an HTTP MCP server inside a Docker container suitable for deployment to Smithery using the “Custom Container” deployment type. 

The server is designed to be compatible with the `@modelcontextprotocol/sdk` HTTP transport pattern used by Smithery’s TypeScript custom-container examples. 

---

## 2. High-level architecture

### 2.1 Components

1. **Skills loader**
   - Scans the `skills/` directory for `SKILL.md` files.
   - Parses each skill file into an in-memory `Skill` object with:
     - `id` (derived from file name or front matter)
     - `title`
     - `description`
     - `tags` (optional)
     - `content` (raw markdown)
   - Builds an auxiliary search index over skills for fast keyword search.

2. **Skill tools registry**
   - For each `Skill` creates a dedicated MCP tool:
     - Tool name derived from `id` (for example `skill_<slug>`).
     - Tool title and description derived from skill metadata.
     - Tool execution returns the markdown content and metadata of the skill.

3. **Search tool**
   - Single tool `search_skills` with input:
     - `query: string`
     - `limit?: number` (default 5)
   - Performs keyword search over all skills and returns:
     - `primaryMatches`: ordered skills deemed most relevant.
     - `alternativeMatches`: related but lower ranked results.
     - For each match:
       - `id`, `title`, `description`, `tags`, `score`, `content`.

4. **MCP server**
   - Uses `@modelcontextprotocol/sdk` with `McpServer` and `StreamableHTTPServerTransport`. 
   - Registers all skill tools and the `search_skills` tool at startup.
   - Exposes a single HTTP endpoint `/mcp` for Smithery to connect to.

5. **HTTP host**
   - Express-based HTTP server:
     - Handles CORS for browser-based or remote MCP clients.
     - Forwards all `/mcp` requests into the MCP server transport.
   - Optional STDI/O transport remains available for local dev parity if desired.

6. **Container runtime**
   - Docker image based on `node:22-slim` (or compatible).
   - Entrypoint starts the HTTP server (`TRANSPORT=http`).
   - Configured for use as a Smithery “Custom Container” deployment. 

---

## 3. Repository structure

Recommended structure:

```text
.
├─ skills/
│  ├─ my-first-skill/
│  │  └─ SKILL.md
│  ├─ another-skill/
│  │  └─ SKILL.md
│  └─ ...
├─ src/
│  ├─ config.ts
│  ├─ server.ts
│  ├─ httpApp.ts
│  ├─ skills/
│  │  ├─ types.ts
│  │  ├─ loader.ts
│  │  ├─ registry.ts
│  │  └─ search.ts
│  └─ index.ts
├─ package.json
├─ tsconfig.json
├─ Dockerfile
└─ technical_specification.md


---

4. Skill file format

4.1 Required layout

Each skill lives under skills/<skill-id>/SKILL.md.

Minimal expected structure:

# <Skill Title>

Short human readable description of what this skill does.

## Usage

Instructions or examples for how to use the skill.

## Details

Additional detail, references, etc.

Optional front matter (if you want richer metadata):

---
id: my-first-skill
title: My First Skill
description: Short description for tool registry
tags:
  - category-a
  - onboarding
---

# My First Skill

...

4.2 Skill metadata extraction

The loader should derive metadata in this order:

1. id

Prefer id from front matter if present.

Otherwise derive from directory name (lowercase, slugified).



2. title

Prefer title from front matter.

Otherwise use the first level-one heading (# Heading) in the file.



3. description

Prefer description from front matter.

Otherwise use:

First paragraph following the title heading, or

A truncated preview (for example first 200 characters of content).




4. tags

Optional array from front matter.

Defaults to empty array.



5. content

Full markdown file contents.





---

5. Skills loader

5.1 Responsibilities

Recursively scan the skills/ directory.

Identify directories containing SKILL.md.

Parse content into Skill objects.

Build a basic in-memory search index (tokenised text and inverted index or a simpler scoring approach).


5.2 Types

Example TypeScript types (no comments as requested):

export interface Skill {
  id: string;
  title: string;
  description: string;
  tags: string[];
  content: string;
  path: string;
}

export interface SkillSearchMatch {
  id: string;
  title: string;
  description: string;
  tags: string[];
  content: string;
  score: number;
}

5.3 Loader API

loadSkills(rootDir: string): Promise<Skill[]>

rootDir usually process.env.SKILLS_DIR || path.resolve(process.cwd(), "skills").

Handles I/O errors gracefully and throws explicit error if no skills found.



---

6. Search engine

6.1 Indexing

For each skill:

Normalise text:

Lowercase

Strip markdown formatting


Index the concatenation of:

id

title

description

tags

content



6.2 Scoring

Simple baseline scoring:

Tokenise query into keywords.

For each skill, compute:

score = w_title * titleHits + w_desc * descHits + w_tags * tagHits + w_body * bodyHits


Example weight pattern:

w_title = 5

w_desc = 3

w_tags = 3

w_body = 1


Sort descending by score then by title.


Define “primary” and “alternative” matches:

primaryMatches: top limit results with score > 0.

alternativeMatches: next 10 hits beyond limit (or all remaining matches if fewer than 10).


6.3 Search API

searchSkills(skills: Skill[], query: string, limit = 5): { primaryMatches: SkillSearchMatch[]; alternativeMatches: SkillSearchMatch[] }

Used by the MCP search_skills tool implementation.


---

7. MCP tools

7.1 MCP server setup

Use McpServer from @modelcontextprotocol/sdk/server/mcp.js and the StreamableHTTPServerTransport from @modelcontextprotocol/sdk/server/streamableHttp.js.

Create a server factory:

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Skill } from "./skills/types.js";
import { searchSkills } from "./skills/search.js";

export function createMcpServer(skills: Skill[]) {
  const server = new McpServer({
    name: "Skill Collection Server",
    version: "1.0.0",
  });

  for (const skill of skills) {
    const toolName = `skill_${skill.id}`;
    server.registerTool(
      toolName,
      {
        title: skill.title,
        description: skill.description || `Skill: ${skill.title}`,
        inputSchema: {},
      },
      async () => {
        return {
          content: [
            {
              type: "text",
              text: skill.content,
            },
          ],
          data: {
            id: skill.id,
            title: skill.title,
            description: skill.description,
            tags: skill.tags,
          },
        };
      }
    );
  }

  server.registerTool(
    "search_skills",
    {
      title: "Search Skills",
      description: "Search SKILL.md files by keyword and return ranked matches",
      inputSchema: {
        query: z.string().describe("Search query or keywords"),
        limit: z.number().int().positive().optional().describe("Maximum number of primary matches to return"),
      },
    },
    async ({ query, limit }) => {
      const { primaryMatches, alternativeMatches } = searchSkills(skills, query, limit ?? 5);
      return {
        content: [
          {
            type: "text",
            text: `Found ${primaryMatches.length} primary matches and ${alternativeMatches.length} alternative matches for query "${query}".`,
          },
        ],
        data: {
          primaryMatches,
          alternativeMatches,
        },
      };
    }
  );

  return server;
}

Notes:

Each skill has a dedicated tool named skill_<id>.

search_skills returns both a textual summary and structured data for programmatic use.



---

8. HTTP transport and Express app

8.1 Express app

Following the pattern from Smithery’s TypeScript custom container example, use Express with CORS and a /mcp handler that wires a StreamableHTTPServerTransport to the HTTP request.

import express, { Request, Response } from "express";
import cors from "cors";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./server.js";
import { loadSkills } from "./skills/loader.js";

const app = express();
const PORT = process.env.PORT || 8080;
const SKILLS_DIR = process.env.SKILLS_DIR || "skills";

app.use(
  cors({
    origin: "*",
    exposedHeaders: ["mcp-Session-Id", "mcp-protocol-version"],
    allowedHeaders: ["Content-Type", "mcp-session-id"],
  })
);

app.use(express.json());

let cachedSkillsPromise: Promise<ReturnType<typeof loadSkills>> | null = null;

async function getSkills() {
  if (!cachedSkillsPromise) {
    cachedSkillsPromise = loadSkills(SKILLS_DIR);
  }
  return cachedSkillsPromise;
}

app.all("/mcp", async (req: Request, res: Response) => {
  try {
    const skills = await getSkills();
    const server = createMcpServer(skills);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on("close", () => {
      transport.close();
      server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: null,
      });
    }
  }
});

export function startHttpServer() {
  app.listen(PORT, () => {
    console.log(`Skills MCP HTTP Server listening on port ${PORT}`);
  });
}

8.2 Entry point

Main entrypoint selects HTTP transport (for Smithery) by environment variable:

import { startHttpServer } from "./httpApp.js";

async function main() {
  const transport = process.env.TRANSPORT || "http";

  if (transport === "http") {
    startHttpServer();
  } else {
    throw new Error("Only HTTP transport is supported in this deployment configuration");
  }
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});

For Smithery deployment the container will run with TRANSPORT=http.


---

9. Configuration

9.1 Environment variables

PORT

Default: 8080.

HTTP port the Express app listens on.


SKILLS_DIR

Default: skills.

Root directory containing the skills hierarchy.


TRANSPORT

Default: http.

For Smithery custom container, must be http.


Optional additional vars:

SERVER_TOKEN if you wish to enforce a simple token-based access check similar to the cookbook example.



9.2 MCP configuration schema (optional)

If you want Smithery clients to pass configuration through MCP session configuration, you can add a configSchema as in the cookbook example and wire it into createMcpServer.


---

10. Build and tooling

10.1 package.json

Sample package.json adapted from the TypeScript custom container example:

{
  "name": "skills-mcp-server",
  "version": "1.0.0",
  "description": "MCP server exposing SKILL.md tools and a search_skills tool",
  "main": "dist/index.js",
  "module": "./src/index.ts",
  "type": "module",
  "scripts": {
    "dev": "TRANSPORT=http npx tsx src/index.ts",
    "build": "npx tsc",
    "start": "TRANSPORT=http node dist/index.js",
    "prepare": "npm run build",
    "prepublishOnly": "npm run build"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.17.3",
    "cors": "^2.8.5",
    "express": "^4.18.2",
    "zod": "^3.25.46"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/node": "^20.10.0",
    "tsx": "^4.19.4",
    "typescript": "^5.3.3"
  }
}

10.2 tsconfig.json

Typical configuration:

{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "node",
    "rootDir": "src",
    "outDir": "dist",
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "resolveJsonModule": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"]
}

10.3 Local build

npm install

npm run build

npm run dev for local HTTP dev (listening on localhost:8080).


You can then point npx @smithery/cli playground at http://localhost:8080/mcp for interactive testing.


---

11. Docker image

11.1 Dockerfile

Start from the pattern shown in the TypeScript custom container cookbook example and adapt for this project:

FROM node:22-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build

ENV TRANSPORT=http
ENV PORT=8080

EXPOSE 8080

CMD ["node", "dist/index.js"]

You can optionally switch to a multi-stage build if you want a smaller runtime image, but the above is sufficient for Smithery custom-container deployment.

11.2 Build and publish

Assuming you use a registry such as GHCR or Docker Hub:

docker build -t <registry>/<namespace>/skills-mcp-server:latest .
docker push <registry>/<namespace>/skills-mcp-server:latest

Take note of the full image reference (for example ghcr.io/my-org/skills-mcp-server:latest) for Smithery configuration.


---

12. Smithery deployment configuration

Although direct access to the full “Custom Container” docs is restricted, Smithery’s custom container deployment model for TypeScript MCP servers expects an HTTP server listening inside the container and serving MCP over a path such as /mcp.

12.1 Pre-requisites

A hosted container registry (GitHub Container Registry, Docker Hub, or equivalent).

Pushed Docker image reference for the MCP server.

Smithery account and permission to create servers.


12.2 Steps to configure in Smithery

1. Create MCP server in Smithery

In the Smithery web UI, create a new server.

Choose the deployment type for a “Custom Container”.



2. Container image configuration

Provide the full Docker image reference:

For example ghcr.io/my-org/skills-mcp-server:latest.


Provide container registry credentials if required by the platform.



3. Port and MCP endpoint

Internal container port: 8080 (matches PORT in Dockerfile).

MCP path: /mcp.

Smithery will direct HTTP MCP traffic to http://container:8080/mcp.



4. Environment variables

TRANSPORT=http

PORT=8080

SKILLS_DIR=/app/skills (or another path if you mount skills differently).

Optional:

SERVER_TOKEN=... if you implement token-based access control.


Ensure the skills directory is present in the image or mounted as a volume at runtime.



5. Health checks

If Smithery supports HTTP health checks for custom containers, configure:

Path: /mcp or a dedicated /health if you add one.

Expect HTTP 200 for a basic request.


At minimum, ensure the server listens successfully so Smithery can detect it as healthy.



6. MCP metadata and registry

Provide server name, description and tags in Smithery’s server metadata form to make it discoverable.

The MCP tools (skill_* and search_skills) will be discovered automatically by clients that introspect the server tools.



7. Testing

Use Smithery’s playground with the deployed server to:

Call search_skills with queries matching known skill titles.

Call a few skill_<id> tools and verify that the returned markdown matches the SKILL.md contents.


Iterate on configuration if any timeouts or errors occur.





---

13. Operational considerations

13.1 Skill updates

Skills are baked into the container image by default.

To update skills:

Change SKILL.md files.

Rebuild and push Docker image.

Redeploy in Smithery.



If you want runtime updates without rebuilds, mount a volume pointing to the skills directory in Smithery’s container configuration, and ensure SKILLS_DIR points to the mount path.

13.2 Caching

Skills are loaded once per process using cachedSkillsPromise.

For very large skill sets or live updates, you may want to:

Periodically invalidate cache.

Or expose an admin endpoint that clears cache.



13.3 Security

If exposed beyond Smithery, consider:

Restricting CORS origin.

Enforcing a SERVER_TOKEN or other auth signal in configuration passed by the MCP client.


Skill content is treated as trusted. To handle untrusted SKILL.md, you may want to sanitise or filter content before returning it.



---

14. Summary

This specification defines:

A file-based skills model using skills/**/SKILL.md.

A skills loader and search engine.

MCP tool registration for:

One tool per skill.

A general search_skills tool returning primary and alternative matches.


A TypeScript MCP server using Express and StreamableHTTPServerTransport.

A Docker-based deployment model compatible with Smithery’s custom container approach.

The required configuration entries to build, publish, and deploy the container to Smithery.


If you would like, the next step can be a concrete implementation plan or initial code scaffolding based directly on this specification.

> Alternative assumption: if you prefer using skills/*.md flat files instead of skills/**/SKILL.md, the same architecture applies with a simplified loader that scans for *.md in a single directory rather than SKILL.md per subdirectory.
