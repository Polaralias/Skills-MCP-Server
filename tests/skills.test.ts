import { promises as fs, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, beforeEach } from 'vitest';
import { loadConfig, Config } from '../src/config';
import { SkillService, SkillSummary } from '../src/skills';

const createTempDir = (): string => mkdtempSync(path.join(tmpdir(), 'skills-test-'));

const writeJson = async (filePath: string, data: unknown): Promise<void> => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
};

describe('SkillService filesystem operations', () => {
  let config: Config;
  let service: SkillService;

  beforeEach(async () => {
    const baseDir = createTempDir();
    const skillsDir = path.join(baseDir, 'skills');
    await fs.mkdir(skillsDir, { recursive: true });

    await writeJson(path.join(skillsDir, 'alpha', 'skill.json'), {
      name: 'Alpha Skill',
      description: 'First skill',
      tags: ['first'],
      files: ['README.md'],
      linkedSkills: ['beta']
    });
    await fs.writeFile(path.join(skillsDir, 'alpha', 'README.md'), '# Alpha\nHello', 'utf8');

    await fs.mkdir(path.join(skillsDir, 'beta', 'docs'), { recursive: true });
    await fs.writeFile(
      path.join(skillsDir, 'beta', 'skill.yaml'),
      [
        'name: Beta Skill',
        'description: Second skill',
        'tags:',
        '  - second',
        'files:',
        '  - docs/guide.md',
        'linkedSkills:',
        '  - alpha'
      ].join('\n'),
      'utf8'
    );
    await fs.writeFile(path.join(skillsDir, 'beta', 'docs', 'guide.md'), 'Beta content', 'utf8');

    await writeJson(path.join(skillsDir, 'gamma', 'skill.json'), {
      name: 'Gamma Skill',
      description: 'Third skill'
    });
    await fs.writeFile(path.join(skillsDir, 'gamma', 'README.md'), '# Gamma\nHello', 'utf8');

    await writeJson(path.join(skillsDir, 'delta', 'skill.json'), {
      name: 'Delta Skill',
      description: 'Missing file skill',
      files: ['docs/missing.md']
    });

    process.env.SKILLS_DIRECTORIES = skillsDir;

    config = loadConfig();
    service = new SkillService({ config });
  });

  it('discovers skills with metadata from JSON and YAML sources', async () => {
    const skills = await service.discoverSkills();

    expect(skills.map((skill) => skill.id)).toEqual(['alpha', 'beta', 'delta', 'gamma']);

    const alpha = skills.find((skill) => skill.id === 'alpha') as SkillSummary;
    expect(alpha.name).toBe('Alpha Skill');
    expect(alpha.tags).toEqual(['first']);
    expect(alpha.linkedSkills).toEqual(['beta']);

    const beta = skills.find((skill) => skill.id === 'beta') as SkillSummary;
    expect(beta.name).toBe('Beta Skill');
    expect(beta.tags).toEqual(['second']);
    expect(beta.linkedSkills).toEqual(['alpha']);

    const gamma = skills.find((skill) => skill.id === 'gamma') as SkillSummary;
    expect(gamma.files).toEqual(['README.md']);
    expect(gamma.linkedSkills).toEqual([]);
  });

  it('loads skill content defined in metadata files', async () => {
    const skill = await service.loadSkill('beta');

    expect(skill.metadata.name).toBe('Beta Skill');
    expect(skill.metadata.linkedSkills).toEqual(['alpha']);
    expect(skill.content['docs/guide.md']).toContain('Beta content');
  });

  it('loads the primary markdown file using existing metadata', async () => {
    const skill = await service.loadSkillMarkdown('beta');

    expect(skill.id).toBe('beta');
    expect(skill.name).toBe('Beta Skill');
    expect(skill.description).toBe('Second skill');
    expect(skill.tags).toEqual(['second']);
    expect(skill.linkedSkills).toEqual(['alpha']);
    expect(skill.primaryFile.path).toBe('docs/guide.md');
    expect(skill.primaryFile.content).toBe('Beta content');
  });

  it('fails when the primary file is missing', async () => {
    await expect(service.loadSkillMarkdown('delta')).rejects.toThrow(
      "Primary file 'docs/missing.md' for skill 'delta' was not found"
    );
  });

  it('returns keyword-ranked search results', async () => {
    const [result] = await service.searchSkills('second');

    expect(result).toBeDefined();
    expect(result?.skillId).toBe('beta');
    expect(result?.metadata.name).toBe('Beta Skill');
  });
});
