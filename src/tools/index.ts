import { SkillService, LoadedSkill, RefreshResult, SkillSummary } from '../skills';
import { SearchResult } from '../vector';

export interface Tool<TInput = unknown, TOutput = unknown> {
  readonly name: string;
  readonly description: string;
  readonly schema: Record<string, unknown>;
  readonly handler: (input: TInput) => Promise<TOutput>;
}

interface SkillSearchResponse {
  readonly results: Array<SearchResult<SkillSummary>>;
}

export const buildTools = (skillService: SkillService): Array<Tool> => {
  const searchTool: Tool<{ query: string; limit?: number }, SkillSearchResponse> = {
    name: 'skill-search',
    description: 'Search the indexed skills by semantic similarity.',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query to match against skills.' },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return.',
          minimum: 1
        }
      },
      required: ['query'],
      additionalProperties: false
    },
    handler: async (input) => {
      const results = await skillService.searchSkills(input.query, input.limit);
      return { results } satisfies SkillSearchResponse;
    }
  };

  const loadTool: Tool<{ id: string }, LoadedSkill> = {
    name: 'skill-load',
    description: 'Load the metadata and content for a specific skill.',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Identifier of the skill to load.' }
      },
      required: ['id'],
      additionalProperties: false
    },
    handler: async (input) => skillService.loadSkill(input.id)
  };

  const refreshTool: Tool<Record<string, never>, RefreshResult> = {
    name: 'skill-refresh',
    description: 'Refresh private skill repositories if configured.',
    schema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    },
    handler: async () => skillService.refreshPrivateRepository()
  };

  return [searchTool, loadTool, refreshTool];
};
