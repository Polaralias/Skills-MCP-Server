import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadSkills } from './loader.js';
import fs from 'fs/promises';
import path from 'path';
import { Skill } from './types.js';

vi.mock('fs/promises');

describe('loadSkills', () => {
  const rootDir = '/mock/skills';

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should load skills from nested directories', async () => {
    const mockFiles = {
      [rootDir]: [
        { name: 'skill-a', isDirectory: () => true, isFile: () => false },
        { name: 'skill-b', isDirectory: () => true, isFile: () => false },
        { name: 'random.txt', isDirectory: () => false, isFile: () => true },
      ],
      [path.join(rootDir, 'skill-a')]: [
        { name: 'SKILL.md', isDirectory: () => false, isFile: () => true },
      ],
      [path.join(rootDir, 'skill-b')]: [
        { name: 'SKILL.md', isDirectory: () => false, isFile: () => true },
      ],
    };

    const mockContent = {
      [path.join(rootDir, 'skill-a', 'SKILL.md')]: `---
title: Skill A
description: Description A
tags:
  - tag1
  - tag2
---
# Skill A Content
`,
      [path.join(rootDir, 'skill-b', 'SKILL.md')]: `# Skill B
Description B.
`,
    };

    // Mock readdir
    vi.mocked(fs.readdir).mockImplementation(async (dir) => {
      const entries = mockFiles[dir as string] || [];
      return entries as any;
    });

    // Mock readFile
    vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
      return mockContent[filePath as string] || '';
    });

    // Mock access
    vi.mocked(fs.access).mockResolvedValue(undefined);

    const skills = await loadSkills(rootDir);

    expect(skills).toHaveLength(2);

    const skillA = skills.find(s => s.id === 'skill-a');
    expect(skillA).toBeDefined();
    expect(skillA?.title).toBe('Skill A');
    expect(skillA?.description).toBe('Description A');
    expect(skillA?.tags).toEqual(['tag1', 'tag2']);

    const skillB = skills.find(s => s.id === 'skill-b');
    expect(skillB).toBeDefined();
    expect(skillB?.title).toBe('Skill B');
    expect(skillB?.description).toBe('Description B.');
    expect(skillB?.tags).toEqual([]);
  });
});
