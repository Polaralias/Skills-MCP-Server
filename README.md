# Skills MCP Server

A Model Context Protocol (MCP) server that discovers, indexes, and serves "skills" from local and private repositories. The server exposes semantic search, skill loading, and repository refresh tooling for agents that support MCP.

## Features

- **Strict TypeScript** project configuration with linting and tests via Vitest.
- **Environment-aware configuration** with validation using Zod.
- **Skill discovery** from configurable directories with JSON/YAML metadata support.
- **Semantic indexing** backed by a pluggable embeddings provider and persistent vector store.
- **Private repository refresh** with optional Git clone/pull orchestration.
- **MCP tooling** for search, load, and refresh, exposed via the SDK server entry point.
- **Manual CLI** (`npm run cli`) for quick search/load/refresh validation.

## Getting Started

```bash
npm install
npm run build
npm test
```

### Environment Variables

Key configuration values are read from the environment (see `src/config`). Common variables include:

- `SKILLS_DIRECTORIES`: Comma-separated list of directories containing skill folders. Defaults to `skills`.
- `PRIVATE_SKILLS_ENABLED`: Set to `true` to enable cloning/pulling of a private skills repository.
- `PRIVATE_SKILLS_GIT_URL`: Git URL used when private skills are enabled.
- `PRIVATE_SKILLS_DIR`: Local checkout directory for private skills (defaults to `private-skills`).
- `VECTOR_STORE_PATH`: Location of the persisted vector store (`.data/vector-store.json` by default).
- `EMBEDDINGS_PROVIDER`: Either `local` (deterministic hash-based embeddings) or `openai`.
- `OPENAI_API_KEY`: Required when `EMBEDDINGS_PROVIDER=openai`.

### Scripts

- `npm run build` – Compile TypeScript to `dist/`.
- `npm test` – Run Vitest suites.
- `npm run lint` – Execute ESLint checks.
- `npm run typecheck` – Ensure TypeScript types compile without emitting output.
- `npm run cli -- <command>` – Execute the manual CLI (see usage below).

### CLI Usage

```bash
npm run cli -- search "vector search" 5
npm run cli -- load sample-skill
npm run cli -- refresh
```

### MCP Manifest

The `.well-known/mcp.json` manifest declares how Smithery and other hosts can launch the server via `node ./dist/server/index.js` after running `npm run build`.

## Testing

Vitest suites cover configuration parsing, skill discovery/loading, vector indexing/search, tool schemas, and repository refresh flows. Run them with `npm test`.
