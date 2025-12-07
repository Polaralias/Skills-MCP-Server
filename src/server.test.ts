import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMcpServer } from './server.js';
import { Skill } from './skills/types.js';

// Global spy
const toolSpy = vi.fn();

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => {
  return {
    McpServer: class {
      constructor(opts: any) {}
      tool(...args: any[]) { return toolSpy(...args); }
      registerTool(...args: any[]) { return toolSpy(...args); }
    }
  };
});

describe('createMcpServer', () => {
  const skills: Skill[] = [
    {
      id: 'test-skill',
      title: 'Test Skill',
      description: 'A test skill description',
      tags: [],
      content: 'Content',
      path: '/path',
    },
  ];

  beforeEach(() => {
    toolSpy.mockClear();
  });

  it('should register tools for skills', () => {
    createMcpServer(skills);

    // Expect tool to be called twice: once for the skill, once for search
    expect(toolSpy).toHaveBeenCalledTimes(2);

    // Check skill tool registration
    const skillCall = toolSpy.mock.calls.find((call: any[]) => call[0] === 'skill_test-skill');
    expect(skillCall).toBeDefined();

    if (skillCall) {
        // Check arguments: name, config, callback
        expect(skillCall[0]).toBe('skill_test-skill');

        const config = skillCall[1];
        expect(config).toBeDefined();
        expect(config.title).toBe('Test Skill');
        expect(config.description).toBe('A test skill description');
        expect(config.inputSchema).toEqual({});
    }
  });
});
