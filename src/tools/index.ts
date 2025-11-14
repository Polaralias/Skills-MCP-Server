import { z } from 'zod';
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

const searchArgsSchema = z.object({
  query: z.string(),
  limit: z.number().int().positive().max(50).optional()
}).strict();

const loadArgsSchema = z.object({
  id: z.string()
}).strict();

export const buildTools = (skillService: SkillService): Array<Tool<unknown, unknown>> => {
  const searchTool: Tool<unknown, SkillSearchResponse> = {
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
      const { query, limit } = searchArgsSchema.parse(input);
      const results = await skillService.searchSkills(query, limit);
      return { results } satisfies SkillSearchResponse;
    }
  };

  const loadTool: Tool<unknown, LoadedSkill> = {
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
    handler: async (input) => {
      const { id } = loadArgsSchema.parse(input);
      return skillService.loadSkill(id);
    }
  };

  const refreshTool: Tool<unknown, RefreshResult> = {
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
