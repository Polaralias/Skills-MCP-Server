import process from 'node:process';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio';
import { loadConfig, Config } from '../config';
import { createEmbeddingsProvider, EmbeddingsProvider } from '../embeddings';
import { SkillService, SkillSummary } from '../skills';
import { VectorStore } from '../vector';

export interface ServerContext {
  readonly config: Config;
  readonly embeddings: EmbeddingsProvider;
  readonly vectorStore: VectorStore<SkillSummary>;
  readonly skillService: SkillService;
  readonly server: McpServer;
}

const SERVER_INFO = {
  name: 'skills-mcp-server',
  version: '0.1.0'
} as const;

export const createServer = (config: Config = loadConfig()): ServerContext => {
  const embeddings = createEmbeddingsProvider(config);
  const vectorStore = new VectorStore<SkillSummary>({
    path: config.vectorStore.path,
    embeddings
  });
  const skillService = new SkillService({ config, embeddings, index: vectorStore });

  const server = new McpServer(SERVER_INFO, {
    capabilities: {
      tools: {
        listChanged: true
      }
    }
  });

  const searchSchema = z.object({
    query: z.string().describe('Search query to match against skill descriptions and content.'),
    limit: z.number().int().positive().max(50).optional()
  });

  server.registerTool(
    'skill-search',
    {
      description: 'Search for skills using semantic similarity.',
      inputSchema: searchSchema
    },
    async ({ query, limit }) => {
      const results = await skillService.searchSkills(query, limit);
      return {
        content: [
          {
            type: 'json',
            json: { results }
          }
        ],
        structuredContent: { results }
      };
    }
  );

  server.registerTool(
    'skill-load',
    {
      description: 'Load a skill by identifier.',
      inputSchema: z.object({
        id: z.string().describe('Identifier of the skill directory to load.')
      })
    },
    async ({ id }) => {
      const skill = await skillService.loadSkill(id);
      return {
        content: [
          {
            type: 'json',
            json: skill
          }
        ],
        structuredContent: skill
      };
    }
  );

  server.registerTool(
    'skill-refresh',
    {
      description: 'Refresh private skill repositories if enabled.'
    },
    async () => {
      const result = await skillService.refreshPrivateRepository();
      return {
        content: [
          {
            type: 'json',
            json: result
          }
        ],
        structuredContent: result
      };
    }
  );

  return {
    config,
    embeddings,
    vectorStore,
    skillService,
    server
  };
};

export const startServer = async (): Promise<ServerContext> => {
  const context = createServer();
  const transport = new StdioServerTransport();
  await context.server.connect(transport);
  await transport.start();
  return context;
};

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch((error) => {
    console.error('Failed to start Skills MCP server:', error);
    process.exitCode = 1;
  });
}
