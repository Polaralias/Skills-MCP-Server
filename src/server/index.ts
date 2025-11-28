import http, { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp';
import { loadConfig, Config } from '../config';
import { SkillService } from '../skills';
import { buildTools } from '../tools';

export interface ServerContext {
  readonly config: Config;
  readonly skillService: SkillService;
  readonly server: McpServer;
  readonly transport: StreamableHTTPServerTransport;
  readonly httpServer: http.Server;
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

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID()
  });

  const httpServer = createHttpServer(transport, config);

  return {
    config,
    skillService,
    server,
    transport,
    httpServer
  };
};

export const startServer = async (): Promise<ServerContext> => {
  const context = createServer();
  await context.server.connect(context.transport);
  context.transport.onerror = (error) => {
    console.error('MCP transport error', error);
  };
  await context.transport.start();

  await new Promise<void>((resolve) => {
    context.httpServer.listen(context.config.port, resolve);
  });

  console.info(`Skills MCP server listening on port ${context.config.port} at /mcp`);

  return context;
};

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch((error) => {
    console.error('Failed to start Skills MCP server:', error);
    process.exitCode = 1;
  });
}

const isCorsPreflight = (req: IncomingMessage): boolean => req.method === 'OPTIONS';

const applyCorsHeaders = (req: IncomingMessage, res: ServerResponse): void => {
  const origin = req.headers.origin;
  res.setHeader('Access-Control-Allow-Origin', origin ?? '*');
  res.setHeader('Vary', 'Origin');
  if (origin) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, *'
  );
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id, mcp-protocol-version');
};

const respondWithCors = (
  req: IncomingMessage,
  res: ServerResponse,
  statusCode = 204
): void => {
  applyCorsHeaders(req, res);
  res.writeHead(statusCode).end();
};

function createHttpServer(
  transport: StreamableHTTPServerTransport,
  config: Config
): http.Server {
  return http.createServer(async (req, res) => {
    if (!req.url) {
      res.writeHead(400).end('Bad Request');
      return;
    }

    const url = new URL(req.url, 'http://localhost');

    if (url.pathname === '/mcp') {
      applyCorsHeaders(req, res);

      if (isCorsPreflight(req)) {
        respondWithCors(req, res);
        return;
      }

      await transport.handleRequest(req, res);
      return;
    }

    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(
        JSON.stringify({ status: 'ok', port: config.port })
      );
      return;
    }

    res.writeHead(404).end('Not Found');
  });
}
