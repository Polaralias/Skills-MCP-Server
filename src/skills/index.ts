import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import YAML from 'yaml';
import { Config } from '../config';

export interface SkillSummary {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly tags: string[];
  readonly files: string[];
  readonly linkedSkills: string[];
  readonly repository?: string;
  readonly version?: string;
  readonly source: 'local';
}

export interface SkillMarkdown {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly tags: string[];
  readonly linkedSkills: string[];
  readonly primaryFile: {
    readonly path: string;
    readonly content: string;
  };
}

export interface LoadedSkill {
  readonly metadata: SkillSummary;
  readonly content: Record<string, string>;
}

export interface SkillSearchResult {
  readonly skillId: string;
  readonly score: number;
  readonly metadata: SkillSummary;
}

interface SkillServiceOptions {
  readonly config: Config;
}

interface SkillRecord {
  readonly summary: SkillSummary;
  readonly directory: string;
}

const metadataSchema = z.object({
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()).default([]),
  files: z.array(z.string()).default([]),
  linkedSkills: z.array(z.string()).default([]),
  repository: z.string().optional(),
  version: z.string().optional()
});

export class SkillService {
  private readonly config: Config;
  private skillCache?: Map<string, SkillRecord>;

  constructor(options: SkillServiceOptions) {
    this.config = options.config;
  }

  public async discoverSkills(): Promise<SkillSummary[]> {
    const records = await this.scanSkills();
    return Array.from(records.values())
      .map((record) => record.summary)
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  public async loadSkill(id: string): Promise<LoadedSkill> {
    const record = await this.getSkillRecord(id);

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

  public async loadSkillMarkdown(id: string): Promise<SkillMarkdown> {
    const record = await this.getSkillRecord(id);
    const primaryRelativePath = record.summary.files[0];

    if (!primaryRelativePath) {
      throw new Error(`Skill '${id}' does not define any files`);
    }

    const primaryPath = path.join(record.directory, primaryRelativePath);
    let primaryContent: string;
    try {
      primaryContent = await fs.readFile(primaryPath, 'utf8');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        throw new Error(
          `Primary file '${primaryRelativePath}' for skill '${id}' was not found`
        );
      }
      throw error;
    }

    return {
      id: record.summary.id,
      name: record.summary.name,
      description: record.summary.description,
      tags: record.summary.tags,
      linkedSkills: record.summary.linkedSkills,
      primaryFile: {
        path: primaryRelativePath,
        content: primaryContent
      }
    };
  }

  public async searchSkills(query: string, limit = 5): Promise<SkillSearchResult[]> {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return [];
    }

    const tokens = normalizedQuery.split(/\s+/).filter((token) => token.length > 0);
    if (tokens.length === 0) {
      return [];
    }

    const records = await this.scanSkills();
    const documents = await Promise.all(
      Array.from(records.values()).map(async (record) => ({
        record,
        text: await this.buildSearchDocument(record)
      }))
    );

    const scored = documents
      .map(({ record, text }) => ({
        record,
        score: this.scoreDocument(tokens, record.summary, text)
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => {
        if (b.score === a.score) {
          return a.record.summary.name.localeCompare(b.record.summary.name);
        }
        return b.score - a.score;
      });

    const cappedLimit = Math.max(1, limit ?? 5);
    return scored.slice(0, cappedLimit).map((entry) => ({
      skillId: entry.record.summary.id,
      score: entry.score,
      metadata: entry.record.summary
    }));
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

  private async getSkillRecord(id: string): Promise<SkillRecord> {
    const records = await this.scanSkills();
    const record = records.get(id);
    if (!record) {
      throw new Error(`Skill '${id}' was not found`);
    }
    return record;
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
    const linkedSkills = Array.from(new Set(metadata.linkedSkills));
    return {
      id: directoryName,
      name: metadata.name,
      description: metadata.description,
      tags: Array.from(new Set(metadata.tags)),
      files,
      linkedSkills,
      repository: metadata.repository,
      version: metadata.version,
      source: 'local'
    };
  }

  private async buildSearchDocument(record: SkillRecord): Promise<string> {
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

    return pieces.join('\n\n');
  }

  private scoreDocument(
    tokens: string[],
    metadata: SkillSummary,
    document: string
  ): number {
    const haystack = document.toLowerCase();
    const name = metadata.name.toLowerCase();
    const description = metadata.description.toLowerCase();
    const tags = metadata.tags.map((tag) => tag.toLowerCase());

    let score = 0;
    for (const token of tokens) {
      if (name.includes(token)) {
        score += 3;
      }
      if (description.includes(token)) {
        score += 2;
      }
      if (tags.some((tag) => tag.includes(token))) {
        score += 1;
      }

      let index = haystack.indexOf(token);
      while (index >= 0) {
        score += 0.5;
        index = haystack.indexOf(token, index + token.length);
      }
    }

    return score;
  }
}
