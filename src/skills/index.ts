import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { z } from 'zod';
import YAML from 'yaml';
import { Config } from '../config';
import { EmbeddingsProvider } from '../embeddings';
import { SemanticIndex, SearchResult, createVectorStore } from '../vector';

export interface SkillSummary {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly tags: string[];
  readonly files: string[];
  readonly repository?: string;
  readonly version?: string;
  readonly source: 'local' | 'private';
}

export interface LoadedSkill {
  readonly metadata: SkillSummary;
  readonly content: Record<string, string>;
}

export interface RefreshResult {
  readonly status: 'skipped' | 'cloned' | 'pulled';
}

interface SkillServiceOptions {
  readonly config: Config;
  readonly embeddings: EmbeddingsProvider;
  readonly index?: SemanticIndex<SkillSummary>;
}

interface SkillRecord {
  readonly summary: SkillSummary;
  readonly directory: string;
}

const metadataSchema = z.object({
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()).default([]),
  files: z.array(z.string()).default(['README.md']),
  repository: z.string().optional(),
  version: z.string().optional()
});

export class SkillService {
  private readonly config: Config;
  private readonly embeddings: EmbeddingsProvider;
  private readonly index: SemanticIndex<SkillSummary>;
  private skillCache?: Map<string, SkillRecord>;

  constructor(options: SkillServiceOptions) {
    this.config = options.config;
    this.embeddings = options.embeddings;
    this.index =
      options.index
      ?? createVectorStore<SkillSummary>({
        driver: this.config.vectorStore.driver,
        path: this.config.vectorStore.path,
        collection: this.config.vectorStore.collection,
        url: this.config.vectorStore.url,
        apiKey: this.config.vectorStore.apiKey,
        dimensions: this.config.vectorStore.dimensions,
        embeddings: this.embeddings
      });
  }

  public async discoverSkills(): Promise<SkillSummary[]> {
    const records = await this.scanSkills();
    return Array.from(records.values())
      .map((record) => record.summary)
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  public async loadSkill(id: string): Promise<LoadedSkill> {
    const records = await this.scanSkills();
    const record = records.get(id);
    if (!record) {
      throw new Error(`Skill '${id}' was not found`);
    }

    const content: Record<string, string> = {};
    for (const relativePath of record.summary.files) {
      const filePath = path.join(record.directory, relativePath);
      const data = await fs.readFile(filePath, 'utf8');
      content[relativePath] = data;
    }

    return {
      metadata: record.summary,
      content
    };
  }

  public async searchSkills(
    query: string,
    limit = 5
  ): Promise<Array<SearchResult<SkillSummary>>> {
    const records = await this.scanSkills();
    const documents = await Promise.all(
      Array.from(records.values()).map(async (record) => {
        const pieces: string[] = [
          record.summary.name,
          record.summary.description,
          record.summary.tags.join(' ')
        ];
        for (const relativePath of record.summary.files) {
          const filePath = path.join(record.directory, relativePath);
          try {
            const data = await fs.readFile(filePath, 'utf8');
            pieces.push(data);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
              throw error;
            }
          }
        }
        return {
          id: record.summary.id,
          text: pieces.join('\n\n'),
          metadata: record.summary
        };
      })
    );

    await this.index.indexSkills(documents);
    return this.index.search(query, { limit });
  }

  public async refreshPrivateRepository(): Promise<RefreshResult> {
    const configuration = this.config.skills.privateRepository;
    if (!configuration.enabled || !configuration.url) {
      return { status: 'skipped' };
    }

    const targetDirectory = path.resolve(configuration.directory);
    await fs.mkdir(path.dirname(targetDirectory), { recursive: true });

    const exists = await pathExists(targetDirectory);

    if (!exists) {
      await runGit([
        'clone',
        '--branch',
        configuration.branch,
        '--single-branch',
        configuration.url,
        targetDirectory
      ]);
      this.skillCache = undefined;
      return { status: 'cloned' };
    }

    await runGit(['-C', targetDirectory, 'fetch', '--all', '--prune']);
    await runGit(['-C', targetDirectory, 'checkout', configuration.branch]);
    await runGit(['-C', targetDirectory, 'pull', 'origin', configuration.branch]);
    this.skillCache = undefined;
    return { status: 'pulled' };
  }

  private async scanSkills(): Promise<Map<string, SkillRecord>> {
    if (this.skillCache) {
      return this.skillCache;
    }

    const records = new Map<string, SkillRecord>();
    for (const directory of this.config.skills.directories) {
      const absoluteDirectory = path.resolve(directory);
      let entries: string[];
      try {
        entries = await fs.readdir(absoluteDirectory);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          continue;
        }
        throw error;
      }
      for (const entry of entries) {
        const skillDirectory = path.join(absoluteDirectory, entry);
        const stat = await fs.stat(skillDirectory).catch(() => undefined);
        if (!stat || !stat.isDirectory()) {
          continue;
        }
        const metadata = await this.readMetadata(skillDirectory);
        if (!metadata) {
          continue;
        }
        const summary = this.createSummary(entry, skillDirectory, metadata);
        records.set(summary.id, { summary, directory: skillDirectory });
      }
    }
    this.skillCache = records;
    return records;
  }

  private async readMetadata(directory: string): Promise<z.infer<typeof metadataSchema> | null> {
    for (const filename of this.config.skills.metadataFilenames) {
      const filePath = path.join(directory, filename);
      try {
        const data = await fs.readFile(filePath, 'utf8');
        if (filename.endsWith('.json')) {
          return metadataSchema.parse(JSON.parse(data));
        }
        if (filename.endsWith('.yaml') || filename.endsWith('.yml')) {
          return metadataSchema.parse(YAML.parse(data));
        }
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'ENOENT') {
          continue;
        }
        throw error;
      }
    }
    return null;
  }

  private createSummary(
    directoryName: string,
    directory: string,
    metadata: z.infer<typeof metadataSchema>
  ): SkillSummary {
    const files = metadata.files.length > 0 ? metadata.files : ['README.md'];
    const privateRoot = path.resolve(this.config.skills.privateRepository.directory);
    const isPrivate = path.resolve(directory).startsWith(privateRoot)
      && this.config.skills.privateRepository.enabled;
    return {
      id: directoryName,
      name: metadata.name,
      description: metadata.description,
      tags: Array.from(new Set(metadata.tags)),
      files,
      repository: metadata.repository,
      version: metadata.version,
      source: isPrivate ? 'private' : 'local'
    };
  }
}

const pathExists = async (targetPath: string): Promise<boolean> => {
  try {
    await fs.access(targetPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw error;
  }
};

const runGit = async (args: string[]): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('git', args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`git ${args.join(' ')} exited with code ${code}`));
      }
    });
  });
};
