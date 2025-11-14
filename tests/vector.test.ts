import { mkdtempSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, beforeEach } from 'vitest';
import { FileVectorStore } from '../src/vector/file-store';
import { EmbeddingsProvider } from '../src/embeddings';

const createTempPath = (file: string): string => path.join(mkdtempSync(path.join(tmpdir(), 'vector-test-')), file);

class CountingEmbeddings implements EmbeddingsProvider {
  public callCount = 0;

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => this.createVector(text));
  }

  private createVector(text: string): number[] {
    this.callCount += 1;
    const tokens = text
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter(Boolean);
    const counts: Record<string, number> = { alpha: 0, beta: 0, gamma: 0 };
    for (const token of tokens) {
      if (counts[token] !== undefined) {
        counts[token] += 1;
      }
    }
    const total = tokens.length || 1;
    return [counts.alpha / total, counts.beta / total, counts.gamma / total, total];
  }
}

describe('VectorStore indexing and search', () => {
  let storePath: string;
  let store: FileVectorStore;
  let embeddings: CountingEmbeddings;

  beforeEach(() => {
    storePath = createTempPath('vectors.json');
    embeddings = new CountingEmbeddings();
    store = new FileVectorStore({ path: storePath, embeddings });
  });

  it('indexes new skills and skips unchanged hashes', async () => {
    await store.indexSkills([
      { id: 'alpha', text: 'Alpha skill content' },
      { id: 'beta', text: 'Beta skill content' }
    ]);

    expect(embeddings.callCount).toBe(2);

    await store.indexSkills([
      { id: 'alpha', text: 'Alpha skill content' },
      { id: 'beta', text: 'Beta skill content' }
    ]);

    expect(embeddings.callCount).toBe(2);

    await store.indexSkills([{ id: 'beta', text: 'Beta gamma update' }]);
    expect(embeddings.callCount).toBe(3);

    const data = JSON.parse(await fs.readFile(storePath, 'utf8'));
    expect(data.entries).toHaveLength(2);
  });

  it('returns semantic search results ordered by cosine similarity', async () => {
    await store.indexSkills([
      { id: 'alpha', text: 'Alpha knowledge base entry' },
      { id: 'beta', text: 'Beta reference guide' }
    ]);

    const results = await store.search('alpha instructions', { limit: 1 });
    expect(results).toHaveLength(1);
    expect(results[0]?.skillId).toBe('alpha');
    expect(results[0]?.score).toBeGreaterThan(0.5);
  });
});
