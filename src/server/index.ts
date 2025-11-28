import process from 'node:process';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio';
import { loadConfig, Config } from '../config';
import { SkillService } from '../skills';
import { buildTools } from '../tools';

export interface ServerContext {
  readonly config: Config;
  readonly skillService: SkillService;
  readonly server: McpServer;
}

const SERVER_INFO = {
  name: 'skills-mcp-server',
  version: '0.1.0'
} as const;

export const createServer = (config: Config = loadConfig()): ServerContext => {
  const skillService = new SkillService({ config });

  const server = new McpServer(SERVER_INFO, {
    capabilities: {
      tools: {
        listChanged: true
      }
    }
  });

  const tools = buildTools(skillService);
  for (const tool of tools) {
    type RegisterToolParams = Parameters<McpServer['registerTool']>;
    const inputSchema = tool.schema as unknown as RegisterToolParams[1]['inputSchema'];
    const handler: RegisterToolParams[2] = async (
      input: Parameters<RegisterToolParams[2]>[0],
      _extra: Parameters<RegisterToolParams[2]>[1]
    ) => {
      const parsedInput = tool.schema.parse(input);
      const result = await tool.handler(parsedInput);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result, null, 2)
          }
        ],
        structuredContent: result as Record<string, unknown>
      };
    };
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema
      },
      handler
    );
  }

  return {
    config,
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
