import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMcpServer } from './server.js';
import { Skill } from './skills/types.js';

// Global spies
const promptSpy = vi.fn();
const resourceSpy = vi.fn();

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => {
  return {
    McpServer: class {
      constructor(opts: any) {}
      prompt(...args: any[]) { return promptSpy(...args); }
      resource(...args: any[]) { return resourceSpy(...args); }
    },
    ResourceTemplate: class {}
  };
});

describe('createMcpServer', () => {
  const skills: Skill[] = [
    {
      family: 'test-family',
      id: 'test-skill',
      title: 'Test Skill',
      description: 'A test skill description',
      tags: [],
      promptPath: '/path/prompt.md',
      resourcePath: '/path/resource.md',
      manifestPath: '/path/manifest.json'
    },
  ];

  beforeEach(() => {
    promptSpy.mockClear();
    resourceSpy.mockClear();
  });

  it('should register prompts and resources for skills', () => {
    createMcpServer(skills);

    // Check prompt registration
    expect(promptSpy).toHaveBeenCalledTimes(1);
    expect(promptSpy).toHaveBeenCalledWith(
        'test-family/test-skill',
        'A test skill description',
        expect.any(Function)
    );

    // Check resource registration
    expect(resourceSpy).toHaveBeenCalledTimes(1);
    expect(resourceSpy).toHaveBeenCalledWith(
        'Test Skill',
        'resources://test-family/test-skill',
        { description: 'A test skill description', mimeType: 'text/markdown' },
        expect.any(Function)
    );
  });
});
