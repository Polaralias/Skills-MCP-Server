import http, { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp';
import { loadConfig, Config } from '../config';
import { SkillService } from '../skills';
import { buildSkillToolForSummary, buildTools, type Tool } from '../tools';

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

const SERVER_DESCRIPTION =
  'Model Context Protocol server for discovering and loading reusable skills';

const buildBaseUrl = (req: IncomingMessage, config: Config): string => {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const protocol = Array.isArray(forwardedProto)
    ? forwardedProto[0]
    : forwardedProto ?? 'http';

  if (req.headers.origin) {
    return req.headers.origin;
  }

  if (req.headers.host) {
    return `${protocol}://${req.headers.host}`;
  }

  return `${protocol}://localhost:${config.port}`;
};

const buildWellKnownManifest = (req: IncomingMessage, config: Config) => {
  const baseUrl = buildBaseUrl(req, config);
  const endpoint = `${baseUrl}/mcp`;

  return {
    mcpServers: {
      [SERVER_INFO.name]: {
        name: 'Skills MCP Server',
        description: SERVER_DESCRIPTION,
        transport: {
          type: 'http',
          url: endpoint
        },
        healthCheck: `${baseUrl}/health`,
        skillsDirectories: config.skills.directories
      }
    }
  } as const;
};

const buildWellKnownConfig = (req: IncomingMessage, config: Config) => {
  const baseUrl = buildBaseUrl(req, config);

  return {
    endpoint: `${baseUrl}/mcp`,
    server: {
      name: SERVER_INFO.name,
      version: SERVER_INFO.version,
      description: SERVER_DESCRIPTION,
      healthCheck: `${baseUrl}/health`
    }
  } as const;
};

export const createServer = async (
  config: Config = loadConfig()
): Promise<ServerContext> => {
  const skillService = new SkillService({ config });

  const server = new McpServer(SERVER_INFO, {
    capabilities: {
      tools: {
        listChanged: true
      }
    }
  });

  const registerTool = (tool: Tool): void => {
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
  };

  const tools = buildTools(skillService);
  for (const tool of tools) {
    registerTool(tool);
  }

  void (async () => {
    try {
      const summaries = await skillService.discoverSkills();
      const dynamicTools = summaries.map((summary) =>
        buildSkillToolForSummary(skillService, summary)
      );

      for (const tool of dynamicTools) {
        registerTool(tool);
      }

      server.sendToolListChanged();
    } catch (error) {
      console.error('Failed to register dynamic skill tools', error);
    }
  })();

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID()
  });

  await server.connect(transport);

  transport.onerror = (error) => {
    console.error('MCP transport error', error);
  };
  await transport.start();

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
  const context = await createServer();

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

const respondWithJson = (
  req: IncomingMessage,
  res: ServerResponse,
  body: unknown,
  statusCode = 200
): void => {
  applyCorsHeaders(req, res);
  res.writeHead(statusCode, { 'Content-Type': 'application/json' }).end(
    JSON.stringify(body, null, 2)
  );
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

    if (url.pathname === '/.well-known/mcp.json') {
      respondWithJson(req, res, buildWellKnownManifest(req, config));
      return;
    }

    if (url.pathname === '/.well-known/mcp-config') {
      respondWithJson(req, res, buildWellKnownConfig(req, config));
      return;
    }

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
