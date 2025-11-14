import process from 'node:process';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio';
import { loadConfig, Config } from '../config';
import { createEmbeddingsProvider, EmbeddingsProvider } from '../embeddings';
import { SkillService, SkillSummary } from '../skills';
import { SemanticIndex, createVectorStore } from '../vector';

export interface ServerContext {
  readonly config: Config;
  readonly embeddings: EmbeddingsProvider;
  readonly vectorStore: SemanticIndex<SkillSummary>;
  readonly skillService: SkillService;
  readonly server: McpServer;
}

const SERVER_INFO = {
  name: 'skills-mcp-server',
  version: '0.1.0'
} as const;

export const createServer = (config: Config = loadConfig()): ServerContext => {
  const embeddings = createEmbeddingsProvider(config);
  const vectorStore = createVectorStore<SkillSummary>({
    driver: config.vectorStore.driver,
    path: config.vectorStore.path,
    collection: config.vectorStore.collection,
    url: config.vectorStore.url,
    apiKey: config.vectorStore.apiKey,
    dimensions: config.vectorStore.dimensions,
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

  const searchArgsSchema = z
    .object({
      query: z.string().describe('Search query to match against skill descriptions and content.'),
      limit: z.number().int().positive().max(50).optional()
    })
    .strict();
  const loadArgsSchema = z
    .object({
      id: z.string().describe('Identifier of the skill directory to load.')
    })
    .strict();
  const refreshArgsSchema = z.object({}).strict();

  server.registerTool(
    'skill-search',
    {
      description: 'Search for skills using semantic similarity.'
    },
    async (args: unknown) => {
      const parsed = searchArgsSchema.parse(args);
      const results = await skillService.searchSkills(parsed.query, parsed.limit ?? undefined);
      return {
        content: [],
        structuredContent: { results } as Record<string, unknown>
      };
    }
  );

  server.registerTool(
    'skill-load',
    {
      description: 'Load a skill by identifier.'
    },
    async (args: unknown) => {
      const parsed = loadArgsSchema.parse(args);
      const skill = await skillService.loadSkill(parsed.id);
      return {
        content: [],
        structuredContent: skill as unknown as Record<string, unknown>
      };
    }
  );

  server.registerTool(
    'skill-refresh',
    {
      description: 'Refresh private skill repositories if enabled.'
    },
    async (args: unknown) => {
      refreshArgsSchema.parse(args);
      const result = await skillService.refreshPrivateRepository();
      return {
        content: [],
        structuredContent: result as unknown as Record<string, unknown>
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
