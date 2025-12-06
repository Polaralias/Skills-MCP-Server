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

const WELL_KNOWN_PATHS = ['/.well-known/mcp.json', '/.well-known/mcp-config'] as const;
const MCP_PATH = '/mcp' as const;
const HEALTH_PATH = '/health' as const;

const normalizeBasePath = (value: string): string => {
  if (!value || value === '/') {
    return '';
  }

  return value.endsWith('/') && value !== '/' ? value.slice(0, -1) : value;
};

const extractBasePath = (pathname: string): string => {
  const knownSuffixes = [...WELL_KNOWN_PATHS, MCP_PATH, HEALTH_PATH];

  for (const suffix of knownSuffixes) {
    if (pathname === suffix) {
      return '';
    }

    if (pathname.endsWith(suffix)) {
      const basePath = pathname.slice(0, -suffix.length);
      return normalizeBasePath(basePath);
    }
  }

  return '';
};

const matchesPath = (pathname: string, target: string): boolean =>
  pathname === target || pathname.endsWith(target);

const buildBaseUrl = (
  req: IncomingMessage,
  config: Config,
  basePath: string
): string => {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const forwardedHost = req.headers['x-forwarded-host'];
  const protocol = Array.isArray(forwardedProto)
    ? forwardedProto[0]
    : forwardedProto ?? 'http';

  const host = Array.isArray(forwardedHost)
    ? forwardedHost[0]
    : forwardedHost ?? req.headers.host;

  if (req.headers.origin) {
    return `${req.headers.origin}${basePath}`;
  }

  if (host) {
    return `${protocol}://${host}${basePath}`;
  }

  return `${protocol}://localhost:${config.port}${basePath}`;
};

const buildWellKnownManifest = (req: IncomingMessage, config: Config, basePath: string) => {
  const baseUrl = buildBaseUrl(req, config, basePath);
  const endpoint = `${baseUrl}${MCP_PATH}`;

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

const buildWellKnownConfig = (req: IncomingMessage, config: Config, basePath: string) => {
  const baseUrl = buildBaseUrl(req, config, basePath);

  return {
    endpoint: `${baseUrl}${MCP_PATH}`,
    server: {
      name: SERVER_INFO.name,
      version: SERVER_INFO.version,
      description: SERVER_DESCRIPTION,
      healthCheck: `${baseUrl}${HEALTH_PATH}`
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

const normalizeAcceptHeader = (req: IncomingMessage): void => {
  const acceptHeader = req.headers.accept;
  const accept = Array.isArray(acceptHeader)
    ? acceptHeader.join(', ')
    : acceptHeader ?? '';

  const hasJson = accept.includes('application/json');
  const hasEventStream = accept.includes('text/event-stream');

  if (hasJson && hasEventStream) {
    return;
  }

  const acceptValues = ['application/json', 'text/event-stream'];
  if (accept.trim().length > 0) {
    acceptValues.push(accept);
  }

  req.headers.accept = acceptValues.join(', ');
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
    const basePath = extractBasePath(url.pathname);

    if (matchesPath(url.pathname, WELL_KNOWN_PATHS[0])) {
      respondWithJson(req, res, buildWellKnownManifest(req, config, basePath));
      return;
    }

    if (matchesPath(url.pathname, WELL_KNOWN_PATHS[1])) {
      respondWithJson(req, res, buildWellKnownConfig(req, config, basePath));
      return;
    }

    if (matchesPath(url.pathname, MCP_PATH)) {
      applyCorsHeaders(req, res);

      if (isCorsPreflight(req)) {
        respondWithCors(req, res);
        return;
      }

      normalizeAcceptHeader(req);
      await transport.handleRequest(req, res);
      return;
    }

    if (matchesPath(url.pathname, HEALTH_PATH)) {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(
        JSON.stringify({ status: 'ok', port: config.port })
      );
      return;
    }

    res.writeHead(404).end('Not Found');
  });
}
