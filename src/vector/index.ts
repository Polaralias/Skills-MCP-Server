import { FileVectorStore, FileVectorStoreOptions, cosineSimilarity } from './file-store';
import { QdrantVectorStore, QdrantVectorStoreOptions } from './qdrant-store';
import type { SemanticIndex, VectorStoreBaseOptions } from './types';

export type VectorStoreDriver = 'file' | 'qdrant';

export interface CreateVectorStoreOptions<TMetadata> extends VectorStoreBaseOptions<TMetadata> {
  readonly driver: VectorStoreDriver;
  readonly path?: string;
  readonly collection?: string;
  readonly url?: string;
  readonly apiKey?: string;
  readonly dimensions?: number;
  readonly client?: QdrantVectorStoreOptions<TMetadata>['client'];
}

export const createVectorStore = <TMetadata>(
  options: CreateVectorStoreOptions<TMetadata>
): SemanticIndex<TMetadata> => {
  if (options.driver === 'file') {
    if (!options.path) {
      throw new Error('File vector store requires a path');
    }
    const fileOptions: FileVectorStoreOptions<TMetadata> = {
      path: options.path,
      embeddings: options.embeddings,
      metadataSerializer: options.metadataSerializer
    };
    return new FileVectorStore(fileOptions);
  }

  if (options.driver === 'qdrant') {
    if (!options.collection) {
      throw new Error('Qdrant vector store requires a collection name');
    }
    if (!options.dimensions) {
      throw new Error('Qdrant vector store requires embedding dimensions');
    }
    const qdrantOptions: QdrantVectorStoreOptions<TMetadata> = {
      collection: options.collection,
      dimensions: options.dimensions,
      embeddings: options.embeddings,
      metadataSerializer: options.metadataSerializer,
      url: options.url,
      apiKey: options.apiKey,
      client: options.client
    };
    return new QdrantVectorStore(qdrantOptions);
  }

  throw new Error(`Unsupported vector store driver: ${options.driver}`);
};

export type { IndexDocument, MetadataSerializer, SearchResult, SemanticIndex, VectorStoreBaseOptions } from './types';
export { FileVectorStore, FileVectorStoreOptions, QdrantVectorStore, QdrantVectorStoreOptions, cosineSimilarity };
