import crypto from 'node:crypto';
import { QdrantClient } from '@qdrant/js-client-rest';
import { IndexDocument, MetadataSerializer, SearchResult, SemanticIndex, VectorStoreBaseOptions } from './types';

interface QdrantPayload<TMetadata> {
  readonly hash?: string;
  readonly metadata?: TMetadata;
  readonly metadataDigest?: string;
}

export interface QdrantVectorStoreOptions<TMetadata> extends VectorStoreBaseOptions<TMetadata> {
  readonly collection: string;
  readonly dimensions: number;
  readonly url?: string;
  readonly apiKey?: string;
  readonly client?: QdrantClient;
}

export class QdrantVectorStore<TMetadata = unknown> implements SemanticIndex<TMetadata> {
  private readonly client: QdrantClient;
  private readonly collection: string;
  private readonly embeddings: VectorStoreBaseOptions<TMetadata>['embeddings'];
  private readonly metadataSerializer?: MetadataSerializer<TMetadata>;
  private readonly dimensions: number;
  private initialised = false;
  private readonly scrollArgs: () => Parameters<QdrantClient['scroll']>[1];

  constructor(options: QdrantVectorStoreOptions<TMetadata>) {
    this.collection = options.collection;
    this.embeddings = options.embeddings;
    this.metadataSerializer = options.metadataSerializer;
    this.dimensions = options.dimensions;
    this.client = options.client ?? new QdrantClient({ url: options.url, apiKey: options.apiKey });
    this.scrollArgs = () => ({
      limit: 200,
      with_payload: false,
      with_vector: false
    });
  }

  public async indexSkills(documents: Array<IndexDocument<TMetadata>>): Promise<void> {
    if (documents.length === 0) {
      return;
    }

    await this.ensureCollection();

    const ids = documents.map((document) => document.id);
    const existing = await this.retrieveExisting(ids);
    const existingMap = new Map<string, QdrantPayload<TMetadata>>();
    for (const point of existing) {
      existingMap.set(String(point.id), (point.payload ?? {}) as QdrantPayload<TMetadata>);
    }

    const toEmbed: Array<{
      document: IndexDocument<TMetadata>;
      hash: string;
      metadata?: TMetadata;
      metadataDigest?: string;
    }> = [];
    const currentIds = new Set(ids);

    for (const document of documents) {
      const hash = createHash(document.text);
      const serializedMetadata = this.metadataSerializer ? this.metadataSerializer(document.metadata) : document.metadata;
      const metadataDigest = serializedMetadata === undefined ? undefined : JSON.stringify(serializedMetadata);
      const existingPayload = existingMap.get(document.id);

      if (
        !existingPayload
        || existingPayload.hash !== hash
        || existingPayload.metadataDigest !== metadataDigest
      ) {
        toEmbed.push({ document, hash, metadata: serializedMetadata, metadataDigest });
      }
    }

    if (toEmbed.length > 0) {
      const embeddings = await this.embeddings.embed(toEmbed.map((item) => item.document.text));
      const points = toEmbed.map((item, index) => {
        const embedding = embeddings[index];
        if (!embedding || embedding.length === 0) {
          throw new Error('Embedding provider returned an empty embedding');
        }
        return {
          id: item.document.id,
          vector: embedding,
          payload: {
            hash: item.hash,
            metadata: item.metadata,
            metadataDigest: item.metadataDigest
          }
        };
      });
      if (points.length > 0) {
        await this.client.upsert(this.collection, { points, wait: true });
      }
    }

    const stale = await this.findStaleIds(currentIds);
    if (stale.length > 0) {
      await this.client.delete(this.collection, { points: stale });
    }
  }

  public async search(
    query: string,
    options: { limit?: number } = {}
  ): Promise<Array<SearchResult<TMetadata>>> {
    await this.ensureCollection();
    const [vector] = await this.embeddings.embed([query]);
    if (!vector || vector.length === 0) {
      return [];
    }

    const limit = options.limit ?? 10;
    const points = await this.client.search(this.collection, {
      vector,
      limit,
      with_payload: true,
      with_vector: false
    });

    return points
      .filter((point) => typeof point.score === 'number')
      .map((point) => {
        const payload = (point.payload ?? {}) as QdrantPayload<TMetadata>;
        return {
          skillId: String(point.id),
          score: point.score,
          metadata: payload.metadata
        };
      });
  }

  private async ensureCollection(): Promise<void> {
    if (this.initialised) {
      return;
    }
    try {
      await this.client.getCollection(this.collection);
    } catch (error) {
      if (isNotFound(error)) {
        await this.client.createCollection(this.collection, {
          vectors: {
            size: this.dimensions,
            distance: 'Cosine'
          }
        });
      } else {
        throw error;
      }
    }
    this.initialised = true;
  }

  private async retrieveExisting(ids: string[]): Promise<Array<{ id: string | number; payload?: unknown }>> {
    if (ids.length === 0) {
      return [];
    }
    try {
      return await this.client.retrieve(this.collection, {
        ids,
        with_payload: true,
        with_vector: false
      });
    } catch (error) {
      if (isNotFound(error)) {
        return [];
      }
      throw error;
    }
  }

  private async findStaleIds(currentIds: Set<string>): Promise<string[]> {
    const stale: string[] = [];
    type ScrollArgs = Parameters<QdrantClient['scroll']>[1];
    type ScrollOffset = ScrollArgs extends { offset?: infer T } ? T : undefined;
    let offset: ScrollOffset;
    do {
      const args = this.scrollArgs();
      const response = await this.client.scroll(this.collection, { ...args, offset });
      for (const point of response.points ?? []) {
        const id = String(point.id);
        if (!currentIds.has(id)) {
          stale.push(id);
        }
      }
      offset = (response.next_page_offset ?? undefined) as ScrollOffset;
    } while (offset);
    return stale;
  }
}

const createHash = (input: string): string => crypto.createHash('sha256').update(input).digest('hex');

const isNotFound = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const status = (error as { status?: number }).status;
  if (typeof status === 'number' && status === 404) {
    return true;
  }
  return false;
};
