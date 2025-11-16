import path from 'node:path';
import { z } from 'zod';

export interface Config {
  readonly nodeEnv: string;
  readonly port: number;
  readonly skills: {
    readonly directories: string[];
    readonly metadataFilenames: string[];
    readonly privateRepository: {
      readonly enabled: boolean;
      readonly url?: string;
      readonly branch: string;
      readonly directory: string;
    };
  };
}

const booleanSchema = z
  .string()
  .trim()
  .transform((value) => {
    const normalized = value.toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes';
  });

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z
    .string()
    .optional()
    .transform((value) => (value ? Number.parseInt(value, 10) : 3000))
    .pipe(z.number().int().positive()),
  SKILLS_DIRECTORIES: z.string().optional(),
  PRIVATE_SKILLS_ENABLED: z.string().optional(),
  PRIVATE_SKILLS_GIT_URL: z.string().optional(),
  PRIVATE_SKILLS_GIT_BRANCH: z.string().optional().default('main'),
  PRIVATE_SKILLS_DIR: z.string().optional()
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

const parseBoolean = (value: string | undefined): boolean => {
  if (!value) {
    return false;
  }
  return booleanSchema.parse(value);
};

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): Config => {
  const parsed = envSchema.parse(env);

  const directories = parseDirectories(parsed.SKILLS_DIRECTORIES);
  if (directories.length === 0) {
    throw new Error('SKILLS_DIRECTORIES must contain at least one directory');
  }

  const privateEnabled = parseBoolean(parsed.PRIVATE_SKILLS_ENABLED);
  if (privateEnabled && !parsed.PRIVATE_SKILLS_GIT_URL) {
    throw new Error('PRIVATE_SKILLS_GIT_URL is required when PRIVATE_SKILLS_ENABLED=true');
  }

  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    skills: {
      directories,
      metadataFilenames: DEFAULT_METADATA_FILENAMES,
      privateRepository: {
        enabled: privateEnabled,
        url: parsed.PRIVATE_SKILLS_GIT_URL,
        branch: parsed.PRIVATE_SKILLS_GIT_BRANCH ?? 'main',
        directory:
          parsed.PRIVATE_SKILLS_DIR ?? path.join(process.cwd(), 'private-skills')
      }
    }
  };
};

export type { Config as AppConfig };
