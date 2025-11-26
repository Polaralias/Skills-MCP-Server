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
  });

  it('parses comma separated skill directories and numeric values', () => {
    process.env.SKILLS_DIRECTORIES = 'one,two , three';
    process.env.PORT = '4123';

    const config = loadConfig();

    expect(config.port).toBe(4123);
    expect(config.skills.directories).toEqual(['one', 'two', 'three']);
  });
});
