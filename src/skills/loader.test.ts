import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadSkills } from './loader.js';
import fs from 'fs/promises';
import path from 'path';

vi.mock('fs/promises');

describe('loadSkills', () => {
  const rootDir = '/mock/root';
  const manifestsDir = path.join(rootDir, 'manifests');

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should load skills from nested directories', async () => {
    // Mock fs.readdir
    vi.mocked(fs.readdir).mockImplementation(async (dir) => {
        if (dir === manifestsDir) {
            return [
                { name: 'android', isDirectory: () => true }
            ] as any;
        }
        if (dir === path.join(manifestsDir, 'android')) {
            return [
                { name: 'dev-standards.json', isFile: () => true }
            ] as any;
        }
        return [] as any;
    });

    // Mock fs.readFile
    vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        if ((filePath as string).endsWith('dev-standards.json')) {
            return JSON.stringify({
                title: 'Android Dev Standards',
                description: 'Best practices',
                tags: ['android', 'kotlin']
            });
        }
        return '';
    });

    // Mock fs.access
    vi.mocked(fs.access).mockResolvedValue(undefined);

    const skills = await loadSkills(rootDir);

    expect(skills).toHaveLength(1);
    const skill = skills[0];
    expect(skill.id).toBe('dev-standards');
    expect(skill.family).toBe('android');
    expect(skill.title).toBe('Android Dev Standards');
    expect(skill.manifestPath).toBe(path.join(manifestsDir, 'android', 'dev-standards.json'));
    expect(skill.promptPath).toBe(path.join(rootDir, 'prompts', 'android', 'dev-standards.md'));
    expect(skill.resourcePath).toBe(path.join(rootDir, 'resources', 'android', 'dev-standards.md'));
  });
});
