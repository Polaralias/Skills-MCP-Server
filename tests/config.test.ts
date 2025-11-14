import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../src/config';

type MutableEnv = NodeJS.ProcessEnv & Record<string, string | undefined>;

const ORIGINAL_ENV = { ...process.env } as MutableEnv;

const resetEnv = (): void => {
  process.env = { ...ORIGINAL_ENV };
};

describe('config loader', () => {
  beforeEach(() => {
    resetEnv();
  });

  afterEach(() => {
    resetEnv();
  });

  it('returns defaults when optional environment variables are missing', () => {
    delete process.env.PORT;
    delete process.env.SKILLS_DIRECTORIES;

    const config = loadConfig();

    expect(config.port).toBe(3000);
    expect(config.skills.directories).toEqual(['skills']);
    expect(config.embeddings.provider).toBe('local');
    expect(config.vectorStore.driver).toBe('file');
    expect(config.vectorStore.path).toMatch(/vector-store\.json$/);
    expect(config.vectorStore.collection).toBe('skills');
  });

  it('parses comma separated skill directories and numeric values', () => {
    process.env.SKILLS_DIRECTORIES = 'one,two , three';
    process.env.PORT = '4123';
    process.env.VECTOR_STORE_PATH = './data/vectors.json';
    process.env.VECTOR_STORE_DRIVER = 'file';

    const config = loadConfig();

    expect(config.port).toBe(4123);
    expect(config.skills.directories).toEqual(['one', 'two', 'three']);
    expect(config.vectorStore.path).toBe('./data/vectors.json');
  });

  it('requires a private repository URL when private refresh is enabled', () => {
    process.env.PRIVATE_SKILLS_ENABLED = 'true';

    expect(() => loadConfig()).toThrowError(/PRIVATE_SKILLS_GIT_URL/i);
  });

  it('requires an API key when OpenAI embeddings are configured', () => {
    process.env.EMBEDDINGS_PROVIDER = 'openai';

    expect(() => loadConfig()).toThrowError(/OPENAI_API_KEY/i);
  });

  it('requires vector store URL and embedding dimensions when qdrant driver is selected', () => {
    process.env.VECTOR_STORE_DRIVER = 'qdrant';

    expect(() => loadConfig()).toThrowError(/VECTOR_STORE_URL/i);

    process.env.VECTOR_STORE_URL = 'http://qdrant:6333';
    expect(() => loadConfig()).toThrowError(/EMBEDDINGS_DIMENSIONS/i);

    process.env.EMBEDDINGS_DIMENSIONS = '1536';
    process.env.VECTOR_STORE_COLLECTION = 'custom-collection';

    const config = loadConfig();
    expect(config.vectorStore.collection).toBe('custom-collection');
    expect(config.vectorStore.driver).toBe('qdrant');
  });

  it('returns private repository configuration when provided', () => {
    process.env.PRIVATE_SKILLS_ENABLED = 'true';
    process.env.PRIVATE_SKILLS_GIT_URL = 'git@example.com:repo.git';
    process.env.PRIVATE_SKILLS_GIT_BRANCH = 'develop';
    process.env.PRIVATE_SKILLS_DIR = 'private-skills';

    const config = loadConfig();

    expect(config.skills.privateRepository.enabled).toBe(true);
    expect(config.skills.privateRepository.url).toBe('git@example.com:repo.git');
    expect(config.skills.privateRepository.branch).toBe('develop');
    expect(config.skills.privateRepository.directory).toBe('private-skills');
  });
});
