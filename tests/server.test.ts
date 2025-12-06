import http from 'node:http';
import { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type ServerContext } from '../src/server';
import type { Config } from '../src/config';

const TEST_CONFIG: Config = {
  nodeEnv: 'test',
  port: 0,
  skills: {
    directories: ['skills'],
    metadataFilenames: ['skill.json']
  }
};

type JsonResponse = {
  status: number;
  body: any;
};

const stopServer = async (context: ServerContext | null): Promise<void> => {
  if (!context) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    context.httpServer.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
};

const startServer = async (): Promise<{ context: ServerContext; port: number }> => {
  const context = await createServer(TEST_CONFIG);
  await new Promise<void>((resolve) => {
    context.httpServer.listen(0, resolve);
  });

  const address = context.httpServer.address();
  if (!address || typeof address === 'string') {
    throw new Error('Unexpected address info');
  }

  return { context, port: (address as AddressInfo).port };
};

const fetchJson = (port: number, path: string): Promise<JsonResponse> =>
  new Promise((resolve, reject) => {
    http
      .get(
        {
          hostname: '127.0.0.1',
          port,
          path
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) });
          });
        }
      )
      .on('error', reject);
  });

describe('well-known endpoints', () => {
  let context: ServerContext | null = null;

  afterEach(async () => {
    await stopServer(context);
    context = null;
  });

  it('returns the MCP manifest with HTTP transport details', async () => {
    const started = await startServer();
    context = started.context;
    const { status, body } = await fetchJson(started.port, '/.well-known/mcp.json');

    expect(status).toBe(200);
    const manifest = body.mcpServers['skills-mcp-server'];
    expect(manifest.transport.url).toBe(`http://127.0.0.1:${started.port}/mcp`);
    expect(manifest.healthCheck).toBe(`http://127.0.0.1:${started.port}/health`);
  });

  it('returns the MCP config alias with endpoint metadata', async () => {
    const started = await startServer();
    context = started.context;
    const { status, body } = await fetchJson(started.port, '/.well-known/mcp-config');

    expect(status).toBe(200);
    expect(body.endpoint).toBe(`http://127.0.0.1:${started.port}/mcp`);
    expect(body.server.name).toBe('skills-mcp-server');
    expect(body.server.healthCheck).toBe(`http://127.0.0.1:${started.port}/health`);
  });

  it('preserves reverse proxy base paths when building URLs', async () => {
    const started = await startServer();
    context = started.context;
    const basePath = '/proxy/base/path';
    const { status, body } = await fetchJson(
      started.port,
      `${basePath}/.well-known/mcp-config`
    );

    expect(status).toBe(200);
    expect(body.endpoint).toBe(`http://127.0.0.1:${started.port}${basePath}/mcp`);
    expect(body.server.healthCheck).toBe(
      `http://127.0.0.1:${started.port}${basePath}/health`
    );
  });
});

describe('mcp endpoint accept handling', () => {
  let context: ServerContext | null = null;
  let port: number | null = null;

type McpRequestOptions = {
  readonly headers?: Record<string, string | undefined>;
  readonly path?: string;
  readonly payload?: string;
};

const sendMcpRequest = async ({
  headers = {},
  path = '/mcp',
  payload = JSON.stringify({
    jsonrpc: '2.0',
    id: 'test',
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'vitest', version: '1.0.0' }
    }
  })
}: McpRequestOptions = {}): Promise<JsonResponse> => {
    if (!port) {
      throw new Error('Server port not available');
    }

    return new Promise<JsonResponse>((resolve, reject) => {
      const parseBody = (raw: string, contentType: string): any => {
        if (!raw.trim()) {
          return null;
        }

        if (contentType.includes('text/event-stream')) {
          return JSON.parse(raw);
        }

        return JSON.parse(raw);
      };

      const request = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload).toString(),
            ...headers
          }
        },
        (res) => {
          const contentType = res.headers['content-type'] ?? '';
          let resolved = false;

          const finish = (raw: string) => {
            if (resolved) {
              return;
            }
            resolved = true;

            try {
              resolve({
                status: res.statusCode ?? 0,
                body: parseBody(raw, contentType as string)
              });
            } catch (error) {
              reject(error);
            }

            res.destroy();
          };

          res.on('data', (chunk) => {
            const text = chunk.toString();

            if (contentType.includes('text/event-stream')) {
              const dataLine = text
                .split(/\r?\n/)
                .find((line) => line.startsWith('data:'));

              if (dataLine) {
                finish(dataLine.replace(/^data:\s*/, ''));
              }
            } else {
              finish(text);
            }
          });

          res.on('end', () => finish(''));
          res.on('error', reject);
        }
      );

      request.setTimeout(5000, () => {
        request.destroy(new Error('Request timed out'));
      });

      request.on('error', reject);
      request.write(payload);
      request.end();
    });
  };

  afterEach(async () => {
    await stopServer(context);
    context = null;
    port = null;
  });

  it('responds to MCP requests with wildcard accept headers', async () => {
    const started = await startServer();
    context = started.context;
    port = started.port;

    const response = await sendMcpRequest({ Accept: '*/*' });

    expect(response.status).toBe(200);
    expect(response.body.jsonrpc).toBe('2.0');
    expect(response.body.result).toBeDefined();
  });

  it('responds to MCP requests when only json is accepted', async () => {
    const started = await startServer();
    context = started.context;
    port = started.port;

    const response = await sendMcpRequest({ Accept: 'application/json' });

    expect(response.status).toBe(200);
    expect(response.body.jsonrpc).toBe('2.0');
    expect(response.body.result).toBeDefined();
  });

  it('responds to MCP requests with explicit streaming accept header', async () => {
    const started = await startServer();
    context = started.context;
    port = started.port;

    const response = await sendMcpRequest({
      Accept: 'application/json, text/event-stream'
    });

    expect(response.status).toBe(200);
    expect(response.body.jsonrpc).toBe('2.0');
    expect(response.body.result).toBeDefined();
  });

  it('handles MCP requests sent through a base path used by reverse proxies', async () => {
    const started = await startServer();
    context = started.context;
    port = started.port;

    const response = await sendMcpRequest({
      path: '/sessions/test/skills/mcp',
      headers: { Accept: '*/*' }
    });

    expect(response.status).toBe(200);
    expect(response.body.jsonrpc).toBe('2.0');
    expect(response.body.result).toBeDefined();
  });

  it('returns a parse error for invalid JSON bodies without hanging the request', async () => {
    const started = await startServer();
    context = started.context;
    port = started.port;

    const response = await sendMcpRequest({
      headers: { Accept: 'application/json' },
      payload: '{"jsonrpc":' // malformed JSON
    });

    expect(response.status).toBe(400);
    expect(response.body?.error?.code).toBe(-32700);
    expect(response.body?.error?.message).toContain('Parse error');
  });
});
