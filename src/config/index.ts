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
  readonly vectorStore: {
    readonly driver: 'file' | 'qdrant';
    readonly path: string;
    readonly url?: string;
    readonly apiKey?: string;
    readonly collection: string;
    readonly dimensions?: number;
  };
  readonly embeddings: {
    readonly provider: string;
    readonly model: string;
    readonly dimensions?: number;
    readonly apiKey?: string;
    readonly baseUrl?: string;
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
  PRIVATE_SKILLS_DIR: z.string().optional(),
  VECTOR_STORE_PATH: z.string().optional().default(path.join('.data', 'vector-store.json')),
  VECTOR_STORE_DRIVER: z.string().optional().default('file'),
  VECTOR_STORE_URL: z.string().optional(),
  VECTOR_STORE_COLLECTION: z.string().optional(),
  VECTOR_STORE_API_KEY: z.string().optional(),
  EMBEDDINGS_PROVIDER: z.string().optional().default('local'),
  EMBEDDINGS_MODEL: z.string().optional().default('text-embedding-3-small'),
  EMBEDDINGS_DIMENSIONS: z
    .string()
    .optional()
    .transform((value) => (value ? Number.parseInt(value, 10) : undefined))
    .optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().optional()
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

  const provider = parsed.EMBEDDINGS_PROVIDER;
  if (provider.toLowerCase() === 'openai' && !parsed.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required when EMBEDDINGS_PROVIDER=openai');
  }

  const vectorStoreDriver = parsed.VECTOR_STORE_DRIVER.toLowerCase() as 'file' | 'qdrant';
  const vectorStorePath = parsed.VECTOR_STORE_PATH ?? path.join('.data', 'vector-store.json');
  const vectorStoreCollection = parsed.VECTOR_STORE_COLLECTION ?? 'skills';

  if (vectorStoreDriver === 'qdrant') {
    if (!parsed.VECTOR_STORE_URL) {
      throw new Error('VECTOR_STORE_URL is required when VECTOR_STORE_DRIVER=qdrant');
    }
    if (!vectorStoreCollection) {
      throw new Error('VECTOR_STORE_COLLECTION is required when VECTOR_STORE_DRIVER=qdrant');
    }
    if (!parsed.EMBEDDINGS_DIMENSIONS) {
      throw new Error('EMBEDDINGS_DIMENSIONS is required when VECTOR_STORE_DRIVER=qdrant');
    }
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
    },
    vectorStore: {
      driver: vectorStoreDriver,
      path: vectorStorePath,
      url: parsed.VECTOR_STORE_URL,
      apiKey: parsed.VECTOR_STORE_API_KEY,
      collection: vectorStoreCollection,
      dimensions: parsed.EMBEDDINGS_DIMENSIONS
    },
    embeddings: {
      provider,
      model: parsed.EMBEDDINGS_MODEL,
      dimensions: parsed.EMBEDDINGS_DIMENSIONS,
      apiKey: parsed.OPENAI_API_KEY,
      baseUrl: parsed.OPENAI_BASE_URL
    }
  };
};

export type { Config as AppConfig };
