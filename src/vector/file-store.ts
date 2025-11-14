import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { IndexDocument, MetadataSerializer, SearchResult, SemanticIndex, VectorStoreBaseOptions } from './types';

interface VectorStoreEntry<TMetadata> {
  readonly id: string;
  readonly hash: string;
  readonly embedding: number[];
  readonly metadata?: TMetadata;
}

interface VectorStoreData<TMetadata> {
  version: number;
  entries: Array<VectorStoreEntry<TMetadata>>;
}

export interface FileVectorStoreOptions<TMetadata> extends VectorStoreBaseOptions<TMetadata> {
  readonly path: string;
}

export class FileVectorStore<TMetadata = unknown> implements SemanticIndex<TMetadata> {
  private readonly filePath: string;
  private readonly embeddings: VectorStoreBaseOptions<TMetadata>['embeddings'];
  private readonly metadataSerializer?: MetadataSerializer<TMetadata>;
  private data?: VectorStoreData<TMetadata>;

  constructor(options: FileVectorStoreOptions<TMetadata>) {
    this.filePath = options.path;
    this.embeddings = options.embeddings;
    this.metadataSerializer = options.metadataSerializer;
  }

  public async indexSkills(documents: Array<IndexDocument<TMetadata>>): Promise<void> {
    if (documents.length === 0) {
      return;
    }

    const store = await this.load();
    const toEmbed: Array<{ index: number; document: IndexDocument<TMetadata>; hash: string }> = [];

    for (const document of documents) {
      const hash = createHash(document.text);
      const existingIndex = store.entries.findIndex((entry) => entry.id === document.id);
      const metadata = this.metadataSerializer ? this.metadataSerializer(document.metadata) : document.metadata;

      if (existingIndex >= 0) {
        const existing = store.entries[existingIndex];
        if (existing.hash !== hash) {
          toEmbed.push({ index: existingIndex, document, hash });
        } else if (metadata !== existing.metadata) {
          store.entries[existingIndex] = {
            ...existing,
            metadata
          };
        }
      } else {
        toEmbed.push({ index: -1, document, hash });
      }
    }

    if (toEmbed.length === 0) {
      await this.save(store);
      return;
    }

    const embeddings = await this.embeddings.embed(toEmbed.map((item) => item.document.text));

    toEmbed.forEach((item, position) => {
      const embedding = embeddings[position];
      if (!embedding || embedding.length === 0) {
        throw new Error('Embedding provider returned an empty embedding');
      }
      const serializedMetadata = this.metadataSerializer ? this.metadataSerializer(item.document.metadata) : item.document.metadata;
      const entry: VectorStoreEntry<TMetadata> = {
        id: item.document.id,
        hash: item.hash,
        embedding,
        metadata: serializedMetadata
      };
      if (item.index >= 0) {
        store.entries[item.index] = entry;
      } else {
        store.entries.push(entry);
      }
    });

    await this.save(store);
  }

  public async search(
    query: string,
    options: { limit?: number } = {}
  ): Promise<Array<SearchResult<TMetadata>>> {
    const store = await this.load();
    if (store.entries.length === 0) {
      return [];
    }

    const [queryVector] = await this.embeddings.embed([query]);
    if (!queryVector || queryVector.length === 0) {
      return [];
    }

    const queryMagnitude = magnitude(queryVector);
    if (queryMagnitude === 0) {
      return [];
    }

    const results = store.entries
      .map((entry) => {
        const score = cosineSimilarity(queryVector, queryMagnitude, entry.embedding);
        return {
          skillId: entry.id,
          score,
          metadata: entry.metadata
        } satisfies SearchResult<TMetadata>;
      })
      .filter((result) => Number.isFinite(result.score) && result.score > 0)
      .sort((a, b) => b.score - a.score);

    const limit = options.limit ?? results.length;
    return results.slice(0, limit);
  }

  private async load(): Promise<VectorStoreData<TMetadata>> {
    if (this.data) {
      return this.data;
    }
    try {
      const buffer = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(buffer) as VectorStoreData<TMetadata>;
      this.data = parsed;
      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        const initial: VectorStoreData<TMetadata> = { version: 1, entries: [] };
        this.data = initial;
        return initial;
      }
      throw error;
    }
  }

  private async save(data: VectorStoreData<TMetadata>): Promise<void> {
    this.data = data;
    const directory = path.dirname(this.filePath);
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf8');
  }
}

const createHash = (input: string): string => crypto.createHash('sha256').update(input).digest('hex');

const magnitude = (vector: number[]): number => {
  return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
};

const cosineSimilarity = (
  queryVector: number[],
  queryMagnitude: number,
  documentVector: number[]
): number => {
  const documentMagnitude = magnitude(documentVector);
  if (documentMagnitude === 0) {
    return 0;
  }
  const dot = queryVector.reduce((sum, value, index) => {
    const documentValue = documentVector[index] ?? 0;
    return sum + value * documentValue;
  }, 0);
  return dot / (queryMagnitude * documentMagnitude);
};

export { cosineSimilarity };
