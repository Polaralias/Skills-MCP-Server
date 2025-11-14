import { EmbeddingsProvider } from '../embeddings';

export interface IndexDocument<TMetadata = unknown> {
  readonly id: string;
  readonly text: string;
  readonly metadata?: TMetadata;
}

export interface SearchResult<TMetadata = unknown> {
  readonly skillId: string;
  readonly score: number;
  readonly metadata?: TMetadata;
}

export interface SemanticIndex<TMetadata = unknown> {
  indexSkills(documents: Array<IndexDocument<TMetadata>>): Promise<void>;
  search(query: string, options?: { limit?: number }): Promise<Array<SearchResult<TMetadata>>>;
}

export interface MetadataSerializer<TMetadata> {
  (metadata: TMetadata | undefined): TMetadata | undefined;
}

export interface VectorStoreBaseOptions<TMetadata> {
  readonly embeddings: EmbeddingsProvider;
  readonly metadataSerializer?: MetadataSerializer<TMetadata>;
}
