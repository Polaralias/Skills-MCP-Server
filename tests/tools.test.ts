import { describe, expect, it } from 'vitest';
import { buildTools } from '../src/tools';
import { SkillService } from '../src/skills';

class FakeSkillService {
  async searchSkills(query: string): Promise<Array<{ skillId: string; score: number; metadata: { id: string; name: string; description: string; tags: string[] } }>> {
    void query;
    return [
      {
        skillId: 'alpha',
        score: 0.9,
        metadata: {
          id: 'alpha',
          name: 'Alpha',
          description: 'Alpha skill',
          tags: ['one']
        }
      }
    ];
  }

  async loadSkill(id: string): Promise<{ metadata: { id: string; name: string; description: string; tags: string[] }; content: Record<string, string> }> {
    return {
      metadata: {
        id,
        name: 'Loaded Skill',
        description: 'Loaded',
        tags: []
      },
      content: {
        'README.md': 'content'
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
    expect(searchTool?.schema).toHaveProperty('properties.query');
    const searchResult = await searchTool?.handler({ query: 'alpha' });
    expect(searchResult).toHaveProperty('results');

    const loadTool = tools.find((tool) => tool.name === 'skill-load');
    expect(loadTool?.schema).toHaveProperty('properties.id');
    const loadResult = await loadTool?.handler({ id: 'alpha' });
    expect(loadResult).toHaveProperty('content');
  });
});
