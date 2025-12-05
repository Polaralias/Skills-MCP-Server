import { z } from 'zod';
import {
  SkillService,
  LoadedSkill,
  SkillSummary,
  SkillSearchResult,
  SkillMarkdown
} from '../skills';

export type ToolSchema = z.ZodObject<Record<string, z.ZodTypeAny>>;

export interface Tool<TSchema extends ToolSchema = ToolSchema, TOutput extends object = object> {
  readonly name: string;
  readonly description: string;
  readonly schema: TSchema;
  readonly handler: (input: z.infer<TSchema>) => Promise<TOutput>;
}

interface SkillSearchResponse {
  readonly results: SkillSearchResult[];
  readonly topSkillMarkdown?: SkillMarkdown;
}

export const buildTools = (skillService: SkillService): Array<Tool> => {
  const searchSchema = z.object({
    query: z.string().describe('Search query to match against skills.'),
    limit: z.number().int().positive().optional()
  });

  const searchTool: Tool<typeof searchSchema, SkillSearchResponse> = {
    name: 'skill-search',
    description: 'Search the indexed skills by keyword relevance.',
    schema: searchSchema,
    handler: async (input) => {
      const results = await skillService.searchSkills(input.query, input.limit);
      const topSkill = results[0];
      const topSkillMarkdown = topSkill
        ? await skillService.loadSkillMarkdown(topSkill.skillId)
        : undefined;

      return { results, topSkillMarkdown } satisfies SkillSearchResponse;
    }
  };

  const loadSchema = z.object({
    id: z.string().describe('Identifier of the skill to load.')
  });

  const loadTool: Tool<typeof loadSchema, LoadedSkill> = {
    name: 'skill-load',
    description: 'Load the metadata and content for a specific skill.',
    schema: loadSchema,
    handler: async (input) => skillService.loadSkill(input.id)
  };

  return [searchTool, loadTool];
};

export const buildSkillToolForSummary = (
  skillService: SkillService,
  summary: SkillSummary
): Tool<ToolSchema, SkillMarkdown> => {
  const schema: ToolSchema = z.object({});

  return {
    name: `skill-${summary.id}`,
    description: `Read the markdown content for skill ${summary.name}.`,
    schema,
    handler: async () => skillService.loadSkillMarkdown(summary.id)
  };
};
