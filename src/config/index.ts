import { z } from 'zod';

export interface Config {
  readonly nodeEnv: string;
  readonly port: number;
  readonly skills: {
    readonly directories: string[];
    readonly metadataFilenames: string[];
  };
}

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z
    .string()
    .optional()
    .transform((value) => (value ? Number.parseInt(value, 10) : 3000))
    .pipe(z.number().int().positive()),
  SKILLS_DIRECTORIES: z.string().optional()
});

const DEFAULT_METADATA_FILENAMES = ['skill.json', 'skill.yaml', 'skill.yml'];

const parseDirectories = (value: string | undefined): string[] => {
  if (!value) {
    return ['skills'];
  }
  return value
    .split(',')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
};

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): Config => {
  const parsed = envSchema.parse(env);

  const directories = parseDirectories(parsed.SKILLS_DIRECTORIES);
  if (directories.length === 0) {
    throw new Error('SKILLS_DIRECTORIES must contain at least one directory');
  }

  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    skills: {
      directories,
      metadataFilenames: DEFAULT_METADATA_FILENAMES
    }
  };
};

export type { Config as AppConfig };
