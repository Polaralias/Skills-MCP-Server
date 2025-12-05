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
    if (context) {
      await new Promise<void>((resolve, reject) => {
        context?.httpServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      context = null;
    }
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
});
