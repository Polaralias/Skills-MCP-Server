import { promises as fs, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
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
      files: ['README.md']
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
        '  - docs/guide.md'
      ].join('\n'),
      'utf8'
    );
    await fs.writeFile(path.join(skillsDir, 'beta', 'docs', 'guide.md'), 'Beta content', 'utf8');

    process.env.SKILLS_DIRECTORIES = skillsDir;

    config = loadConfig();
    service = new SkillService({ config });
  });

  it('discovers skills with metadata from JSON and YAML sources', async () => {
    const skills = await service.discoverSkills();

    expect(skills.map((skill) => skill.id)).toEqual(['alpha', 'beta']);

    const alpha = skills.find((skill) => skill.id === 'alpha') as SkillSummary;
    expect(alpha.name).toBe('Alpha Skill');
    expect(alpha.tags).toEqual(['first']);

    const beta = skills.find((skill) => skill.id === 'beta') as SkillSummary;
    expect(beta.name).toBe('Beta Skill');
    expect(beta.tags).toEqual(['second']);
  });

  it('loads skill content defined in metadata files', async () => {
    const skill = await service.loadSkill('beta');

    expect(skill.metadata.name).toBe('Beta Skill');
    expect(skill.content['docs/guide.md']).toContain('Beta content');
  });

  it('returns keyword-ranked search results', async () => {
    const [result] = await service.searchSkills('second');

    expect(result).toBeDefined();
    expect(result?.skillId).toBe('beta');
    expect(result?.metadata.name).toBe('Beta Skill');
  });
});

describe('private repository refresh', () => {
  const runGit = async (args: string[], cwd: string): Promise<void> => {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('git', args, { cwd });
      child.on('error', reject);
      child.on('exit', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`git ${args.join(' ')} exited with ${code}`));
        }
      });
    });
  };

  const writeFile = async (file: string, content: string): Promise<void> => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content, 'utf8');
  };

  it('clones the repository when not already present', async () => {
    const remoteDir = createTempDir();
    await runGit(['init', '--bare'], remoteDir);

    const seedDir = createTempDir();
    await runGit(['init'], seedDir);
    await writeFile(path.join(seedDir, 'README.md'), 'seed');
    await runGit(['add', '.'], seedDir);
    await runGit(['commit', '-m', 'initial'], seedDir);
    await runGit(['branch', '-M', 'main'], seedDir);
    await runGit(['remote', 'add', 'origin', remoteDir], seedDir);
    await runGit(['push', '-u', 'origin', 'main'], seedDir);

    const cloneDir = path.join(createTempDir(), 'private');
    process.env.PRIVATE_SKILLS_ENABLED = 'true';
    process.env.PRIVATE_SKILLS_GIT_URL = remoteDir;
    process.env.PRIVATE_SKILLS_DIR = cloneDir;

    const config = loadConfig();
    const service = new SkillService({ config });

    const result = await service.refreshPrivateRepository();
    expect(result.status).toBe('cloned');
    const clonedFile = await fs.readFile(path.join(cloneDir, 'README.md'), 'utf8');
    expect(clonedFile).toContain('seed');
  });

  it('pulls the repository when already cloned', async () => {
    const remoteDir = createTempDir();
    await runGit(['init', '--bare'], remoteDir);

    const seedDir = createTempDir();
    await runGit(['init'], seedDir);
    await writeFile(path.join(seedDir, 'README.md'), 'initial');
    await runGit(['add', '.'], seedDir);
    await runGit(['commit', '-m', 'initial'], seedDir);
    await runGit(['branch', '-M', 'main'], seedDir);
    await runGit(['remote', 'add', 'origin', remoteDir], seedDir);
    await runGit(['push', '-u', 'origin', 'main'], seedDir);

    const cloneDir = path.join(createTempDir(), 'private');
    process.env.PRIVATE_SKILLS_ENABLED = 'true';
    process.env.PRIVATE_SKILLS_GIT_URL = remoteDir;
    process.env.PRIVATE_SKILLS_DIR = cloneDir;

    let config = loadConfig();
    let service = new SkillService({ config });

    await service.refreshPrivateRepository();

    await writeFile(path.join(seedDir, 'README.md'), 'updated');
    await runGit(['add', '.'], seedDir);
    await runGit(['commit', '-m', 'update'], seedDir);
    await runGit(['push'], seedDir);

    process.env.PRIVATE_SKILLS_ENABLED = 'true';
    process.env.PRIVATE_SKILLS_GIT_URL = remoteDir;
    process.env.PRIVATE_SKILLS_DIR = cloneDir;
    config = loadConfig();
    service = new SkillService({ config });

    const result = await service.refreshPrivateRepository();
    expect(result.status).toBe('pulled');
    const contents = await fs.readFile(path.join(cloneDir, 'README.md'), 'utf8');
    expect(contents).toContain('updated');
  });
});
