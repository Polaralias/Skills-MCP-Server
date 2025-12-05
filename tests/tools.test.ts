import { describe, expect, it } from 'vitest';
import { buildSkillToolForSummary, buildTools } from '../src/tools';
import { SkillService } from '../src/skills';

class FakeSkillService {
  async searchSkills(query: string) {
    void query;
    return [
      {
        skillId: 'alpha',
        score: 0.9,
        metadata: {
          id: 'alpha',
          name: 'Alpha',
          description: 'Alpha skill',
          tags: ['one'],
          linkedSkills: ['beta'],
          files: ['README.md'],
          repository: undefined,
          version: undefined,
          source: 'local' as const
        }
      }
    ];
  }

  async loadSkill(id: string) {
    return {
      metadata: {
        id,
        name: 'Loaded Skill',
        description: 'Loaded',
        tags: [],
        linkedSkills: [],
        files: ['README.md'],
        repository: undefined,
        version: undefined,
        source: 'local' as const
      },
      content: {
        'README.md': 'content'
      }
    };
  }

  async loadSkillMarkdown(id: string) {
    return {
      id,
      name: 'Loaded Markdown',
      description: 'Markdown',
      tags: [],
      linkedSkills: ['gamma'],
      primaryFile: {
        path: 'README.md',
        content: '# Markdown content'
      }
    };
  }
}

describe('MCP tool wiring', () => {
  it('exposes search and load tools with schemas', async () => {
    const tools = buildTools(new FakeSkillService() as unknown as SkillService);
    const names = tools.map((tool) => tool.name).sort();
    expect(names).toEqual(['skill-load', 'skill-search']);

    const searchTool = tools.find((tool) => tool.name === 'skill-search');
    expect(searchTool?.schema.safeParse({ query: 'alpha', limit: 1 }).success).toBe(true);
    const searchResult = await searchTool?.handler({ query: 'alpha', limit: 1 });
    expect(searchResult).toHaveProperty('results');
    expect(searchResult).toHaveProperty('topSkillMarkdown');
    expect(searchResult?.topSkillMarkdown?.linkedSkills).toEqual(['gamma']);
    expect(searchResult?.topSkillMarkdown?.primaryFile.content).toContain('# Markdown content');

    const loadTool = tools.find((tool) => tool.name === 'skill-load');
    expect(loadTool?.schema.safeParse({ id: 'alpha' }).success).toBe(true);
    const loadResult = await loadTool?.handler({ id: 'alpha' });
    expect(loadResult).toHaveProperty('content');
  });

  it('creates per-skill markdown tools with empty schemas', async () => {
    const fakeService = new FakeSkillService();
    const summary = {
      id: 'delta',
      name: 'Delta',
      description: 'Delta skill',
      tags: ['four'],
      linkedSkills: ['epsilon'],
      files: ['README.md'],
      repository: undefined,
      version: undefined,
      source: 'local' as const
    };

    const tool = buildSkillToolForSummary(fakeService as unknown as SkillService, summary);
    expect(tool.name).toBe('skill-delta');
    expect(tool.schema.safeParse({}).success).toBe(true);
    const markdown = await tool.handler({});
    expect(markdown.id).toBe('delta');
    expect(markdown.linkedSkills).toEqual(['gamma']);
    expect(markdown.primaryFile.content).toContain('# Markdown content');
  });
});
