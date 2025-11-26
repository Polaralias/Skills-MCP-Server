# Skills MCP Server

The Skills MCP Server is a Model Context Protocol (MCP) service that discovers, indexes, and serves reusable "skills" from local directories. It offers keyword-based search and skill loading so MCP-compatible agents can quickly locate the right capabilities.

## Overview

The project provides:

- **Strict TypeScript** compilation, linting, and testing defaults to keep the codebase reliable.
- **Environment-driven configuration** that is validated with Zod and surfaced to both the server and the manual CLI.
- **Skill discovery and indexing** against configurable directories containing JSON or YAML metadata, with lightweight keyword-based scoring.
- **MCP tools** for skill search and load that can be consumed by Smithery or any MCP host.

## Architecture

The repository is organized into focused packages:

- `src/config` parses and validates environment variables (directories) and exposes a typed `Config` object used everywhere else.
- `src/skills` scans configured directories for metadata files (`skill.json`, `skill.yaml`, or `skill.yml`), loads content, and scores results without any external dependencies.
- Keyword scoring occurs inside `src/skills`, so no external vector store or embeddings provider is required.
- `src/tools` defines the MCP tools (`skill-search`, `skill-load`) with JSON Schemas and handlers that wrap the `SkillService` methods.
- `src/server` wires the SDK server entry point with configured tools for MCP hosts.
- `scripts/cli.ts` offers a manual CLI that shares the same configuration and services for local validation.
- `tests/` contains Vitest suites covering configuration parsing, skill scanning, and tool schemas to prevent regressions.

## Local development setup

### Prerequisites

- Node.js ≥ 18 (matching the `engines` requirement in `package.json`).
- npm 9+ (ships with Node 18).
- Git.

### Install, build, and run

```bash
git clone https://github.com/<your-org>/Skills-MCP-Server.git
cd Skills-MCP-Server
npm install
npm run build
NODE_ENV=development npm start # see "Starting the server" below
```

During development you can use the following scripts:

- `npm run build` – Compile TypeScript into `dist/` with the project configuration.
- `npm run lint` – Run ESLint across `src/`, `scripts/`, and `tests/`.
- `npm run typecheck` – Ensure TypeScript types compile without emitting files.
- `npm test` – Execute Vitest suites.
- `npm run cli -- <command>` – Invoke the manual CLI (see "Manual CLI" below).

### Environment variables

All runtime configuration flows through environment variables parsed in `src/config`.

| Variable | Description | Default |
| --- | --- | --- |
| `NODE_ENV` | Runtime environment label used for logging and diagnostics. | `development` |
| `PORT` | HTTP port for the MCP server. | `3000` |
| `SKILLS_DIRECTORIES` | Comma-separated list of directories that contain skill folders. | `skills` |

Set `SKILLS_DIRECTORIES` to the folder that Smithery or your container image should mount. Smithery defaults to the repository's root `skills/` directory, while Docker deployments can point to any mounted path via environment variables.

### Starting the server

After building (`npm run build`), start the MCP server with:

```bash
node dist/server/index.js
```

By default the server listens on `PORT` (3000) and registers the MCP tools exposed in `src/tools` for connected clients.

## Managing skills

### Adding public skills

1. Create a folder inside one of the directories listed in `SKILLS_DIRECTORIES` (defaults to `skills/<skill-id>`).
2. Add a metadata file named `skill.json`, `skill.yaml`, or `skill.yml` with the following fields:
   - `name` and `description` (strings).
   - Optional `tags` array for search keywords.
   - Optional `files` array listing additional files to include when loading the skill (defaults to `README.md`).
   - Optional `repository` and `version` metadata for traceability.
3. Add any files referenced by the metadata (for example `README.md`, code snippets, or prompts).
4. Run `npm run cli -- search "<query>"` or `npm run cli -- load <skill-id>` to verify indexing locally.

## Testing

Run the Vitest suites at any time:

```bash
npm test
```

The tests cover configuration parsing, skill discovery, and tool schemas to ensure the server remains stable.

## Manual CLI

Use the manual CLI to experiment without launching an MCP client:

```bash
# Search for related skills
npm run cli -- search "vector search" 5

# Load a specific skill and inspect the returned metadata + file contents
npm run cli -- load sample-skill
```

The CLI prints JSON responses for each command and shares the same configuration and scoring logic as the server.

## Docker and Docker Compose

You can containerize the server with the official Node image. The example below builds the project and mounts the skill directories:

```bash
docker build -t skills-mcp-server \
  --build-arg NODE_VERSION=20 \
  -f- . <<'EOF'
FROM node:${NODE_VERSION:-20}-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
CMD ["node", "dist/server/index.js"]
EOF

docker run --rm -it \
  -p 3000:3000 \
  -e PORT=3000 \
  -e SKILLS_DIRECTORIES=/data/skills \
  -v "$(pwd)/skills:/data/skills" \
  skills-mcp-server
```

For longer-lived setups, create a `docker-compose.yml` that reuses the same volume strategy:

```yaml
services:
  skills:
    image: skills-mcp-server
    build: .
    ports:
      - "3000:3000"
    environment:
      PORT: 3000
      SKILLS_DIRECTORIES: /data/skills
    volumes:
      - ./skills:/data/skills:ro
```

Mount your local skills directory to keep it editable without rebuilding the image. The container only needs the skills files and environment variables; no Git credentials or additional services are required.

### Docker Compose deployment

The repository ships with a `docker-compose.yml` that is ready for production-style deployments and local file loading. Skills are mounted from the `skills/` directory in the repository so you can edit metadata and supporting files without rebuilding the image.

```bash
# Ensure the local skills directories exist (they are pre-seeded with .gitkeep files)
mkdir -p skills

# Build and start the service
docker compose up --build
```

The compose service exposes port `3000` by default and mounts `skills/` as read-only for local skill files. Update the `SKILLS_DIRECTORIES` value in `docker-compose.yml` if you want to point at different directories on the container filesystem.

## Smithery integration and MCP tooling

Smithery and other MCP hosts discover the server via the `.well-known/mcp.json` manifest, which declares the executable (`node ./dist/server/index.js`) and friendly display name.

For Smithery deployments, keep `SKILLS_DIRECTORIES` at its default value of `skills` so the platform can read the repository's root `skills/` folder directly.

### Registering with Smithery

1. Deploy or run the server locally and expose port 3000.
2. In Smithery, add a custom MCP server and supply the manifest URL (`https://<host>/.well-known/mcp.json`) or point it to your local file.
3. Smithery will spawn the command listed in the manifest and automatically load the tools defined in `src/tools`.

### Tool payload examples

All tools accept/return JSON payloads that match the schemas in `src/tools/index.ts`.

```json
// skill-search request
{
  "name": "skill-search",
  "arguments": {
    "query": "vector store",
    "limit": 3
  }
}

// skill-search response payload
{
  "results": [
    {
      "id": "vector-basics",
      "score": 0.82,
      "metadata": {
        "id": "vector-basics",
        "name": "Vector Store Basics",
        "description": "Introductory skill covering vector indexes",
        "tags": ["vector", "search"],
        "files": ["README.md"],
        "source": "local"
      }
    }
  ]
}

// skill-load request
{
  "name": "skill-load",
  "arguments": {
    "id": "vector-basics"
  }
}

// skill-load response payload
{
  "metadata": {
    "id": "vector-basics",
    "name": "Vector Store Basics",
    "description": "Introductory skill covering vector indexes",
    "tags": ["vector", "search"],
    "files": ["README.md"],
    "source": "local"
  },
  "content": {
    "README.md": "# Vector Store Basics\n..."
  }
}
```

Smithery displays the JSON responses in its UI, so you can copy-paste the payloads above into manual tool invocations for quick validation. Search responses include keyword relevance scores and the full metadata block, and load responses echo the metadata while inlining the requested files.

