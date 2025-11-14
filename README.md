# Skills MCP Server

The Skills MCP Server is a Model Context Protocol (MCP) service that discovers, indexes, and serves reusable "skills" from local and private repositories. It offers semantic search, skill loading, and repository refresh tooling so MCP-compatible agents can quickly locate the right capabilities.

## Overview

The project provides:

- **Strict TypeScript** compilation, linting, and testing defaults to keep the codebase reliable.
- **Environment-driven configuration** that is validated with Zod and surfaced to both the server and the manual CLI.
- **Skill discovery and indexing** against configurable directories containing JSON or YAML metadata, with persistent vector embeddings.
- **MCP tools** for skill search, load, and private repository refresh that can be consumed by Smithery or any MCP host.

## Architecture

The repository is organized into focused packages:

- `src/config` parses and validates environment variables (directories, embeddings, vector-store path, private Git settings) and exposes a typed `Config` object used everywhere else.
- `src/skills` scans configured directories for metadata files (`skill.json`, `skill.yaml`, or `skill.yml`), loads content, manages a persistent semantic index, and optionally clones or pulls a private Git repository when refresh is triggered.
- `src/vector` and `src/embeddings` provide a pluggable vector store backed by embeddings providers (local hash or OpenAI HTTP) so semantic search can be performed consistently.
- `src/tools` defines the MCP tools (`skill-search`, `skill-load`, `skill-refresh`) with JSON Schemas and handlers that wrap the `SkillService` methods.
- `src/server` wires the SDK server entry point with configured tools for MCP hosts.
- `scripts/cli.ts` offers a manual CLI that shares the same configuration and services for local validation.
- `tests/` contains Vitest suites covering configuration parsing, skill scanning, vector indexing, and tool schemas to prevent regressions.

## Local development setup

### Prerequisites

- Node.js ≥ 18 (matching the `engines` requirement in `package.json`).
- npm 9+ (ships with Node 18).
- Git (for private skill repository refresh operations).

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
| `PRIVATE_SKILLS_ENABLED` | Enable Git cloning/pulling for private skills. Requires `PRIVATE_SKILLS_GIT_URL`. | `false` |
| `PRIVATE_SKILLS_GIT_URL` | Git URL to clone when private skills are enabled. | — |
| `PRIVATE_SKILLS_GIT_BRANCH` | Branch name used for the private checkout. | `main` |
| `PRIVATE_SKILLS_DIR` | Local directory where the private repository is cloned. | `<repo>/private-skills` |
| `VECTOR_STORE_DRIVER` | Backend for semantic storage (`file` or `qdrant`). | `file` |
| `VECTOR_STORE_PATH` | Location of the persisted semantic index when using the file driver. | `.data/vector-store.json` |
| `VECTOR_STORE_URL` | Base URL of the Qdrant service when `VECTOR_STORE_DRIVER=qdrant`. | — |
| `VECTOR_STORE_COLLECTION` | Qdrant collection that stores skill embeddings. | `skills` |
| `VECTOR_STORE_API_KEY` | Optional API key for secured Qdrant deployments. | — |
| `EMBEDDINGS_PROVIDER` | Embeddings provider name (`local` or `openai`). | `local` |
| `EMBEDDINGS_MODEL` | Embeddings model identifier for the selected provider. | `text-embedding-3-small` |
| `EMBEDDINGS_DIMENSIONS` | Embedding dimensionality. Required for Qdrant deployments. | — |
| `OPENAI_API_KEY` | API key used when `EMBEDDINGS_PROVIDER=openai`. | — |
| `OPENAI_BASE_URL` | Optional custom base URL for OpenAI-compatible providers. | — |

If you enable private skills but omit the Git URL or OpenAI provider without an API key, startup will fail with configuration validation errors, helping you catch misconfigurations early.

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

### Adding private skills

1. Configure the environment variables:
   ```bash
   export PRIVATE_SKILLS_ENABLED=true
   export PRIVATE_SKILLS_GIT_URL=git@github.com:<org>/<repo>.git
   export PRIVATE_SKILLS_GIT_BRANCH=main # optional
   export PRIVATE_SKILLS_DIR=/absolute/path/to/private-skills
   ```
2. Build the server (`npm run build`) and run either the server or the CLI refresh command:
   ```bash
   npm run cli -- refresh
   ```
   The refresh command clones the repository to `PRIVATE_SKILLS_DIR` if it does not exist, or fetches, checks out, and pulls the configured branch when it already exists.
3. Skills under the cloned repository are indexed alongside local skills on the next search/load call because the cache is invalidated whenever a refresh completes.

### Git-based refresh configuration

Refresh operations are executed with the system `git` binary. Ensure the runtime environment has SSH keys or HTTPS credentials configured so `git clone` and `git pull` succeed. You can schedule periodic refreshes by invoking the `skill-refresh` tool or CLI command from automation.

## Testing

Run the Vitest suites at any time:

```bash
npm test
```

The tests cover configuration parsing, skill discovery, vector indexing, and tool schemas to ensure the server remains stable.

## Manual CLI

Use the manual CLI to experiment without launching an MCP client:

```bash
# Search for semantically-related skills
npm run cli -- search "vector search" 5

# Load a specific skill and inspect the returned metadata + file contents
npm run cli -- load sample-skill

# Clone or pull the private skills repository
npm run cli -- refresh
```

The CLI prints JSON responses for each command and shares the same configuration, embeddings provider, and vector store implementation as the server.

## Docker and Docker Compose

You can containerize the server with the official Node image. The example below builds the project, mounts the skill directories, and persists the vector store:

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
  -v skills_mcp_data:/app/.data \
  skills-mcp-server
```

For longer-lived setups, create a `docker-compose.yml` that provisions Qdrant alongside the Skills MCP server:

```yaml
services:
  qdrant:
    image: qdrant/qdrant:v1.12.4
    restart: unless-stopped
    volumes:
      - qdrant_data:/qdrant/storage
    ports:
      - "6333:6333"

  skills-mcp:
    build:
      context: .
      dockerfile: docker/Dockerfile
    depends_on:
      - qdrant
    environment:
      NODE_ENV: production
      PORT: 3000
      SKILLS_DIRECTORIES: /app/skills/public,/app/skills/private
      PRIVATE_SKILLS_ENABLED: "false"
      PRIVATE_SKILLS_DIR: /app/skills/private
      VECTOR_STORE_DRIVER: qdrant
      VECTOR_STORE_URL: http://qdrant:6333
      VECTOR_STORE_COLLECTION: skills
      EMBEDDINGS_PROVIDER: openai
      EMBEDDINGS_MODEL: text-embedding-3-small
      EMBEDDINGS_DIMENSIONS: 1536
      OPENAI_API_KEY: ${OPENAI_API_KEY}
    volumes:
      - ./skills/public:/app/skills/public
      - ./skills/private:/app/skills/private
      - skills_mcp_index:/app/.data
    ports:
      - "3000:3000"

volumes:
  qdrant_data:
  skills_mcp_index:
```

When using the file-based store (`VECTOR_STORE_DRIVER=file`), mount a persistent volume at the path specified by `VECTOR_STORE_PATH`. Mount your local public and private skill directories to keep them editable without rebuilding. The container requires `git` and appropriate credentials when private refresh is enabled; bake them into the image or mount them via secrets as appropriate.

## Smithery integration and MCP tooling

Smithery and other MCP hosts discover the server via the `.well-known/mcp.json` manifest, which declares the executable (`node ./dist/server/index.js`) and friendly display name.

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

// skill-refresh request
{
  "name": "skill-refresh",
  "arguments": {}
}

// skill-refresh response payload
{
  "status": "pulled"
}
```

Smithery displays the JSON responses in its UI, so you can copy-paste the payloads above into manual tool invocations for quick validation. Search responses include semantic similarity scores and the full metadata block, load responses echo the metadata and inline the requested files, and refresh responses indicate whether a clone, pull, or skip occurred.

