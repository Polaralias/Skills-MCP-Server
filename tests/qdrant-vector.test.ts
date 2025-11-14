import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmbeddingsProvider } from '../src/embeddings';
import { QdrantVectorStore } from '../src/vector/qdrant-store';

type MockedClient = {
  getCollection: ReturnType<typeof vi.fn>;
  createCollection: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  retrieve: ReturnType<typeof vi.fn>;
  scroll: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  search: ReturnType<typeof vi.fn>;
};

const createMocks = () => {
  const client: MockedClient = {
    getCollection: vi.fn(),
    createCollection: vi.fn(),
    upsert: vi.fn(),
    retrieve: vi.fn(),
    scroll: vi.fn(),
    delete: vi.fn(),
    search: vi.fn()
  };
  const embeddings: EmbeddingsProvider = {
    embed: vi.fn()
  };
  return { client, embeddings };
};

describe('QdrantVectorStore', () => {
  let client: MockedClient;
  let embeddings: EmbeddingsProvider;

  beforeEach(() => {
    ({ client, embeddings } = createMocks());
    (embeddings.embed as ReturnType<typeof vi.fn>).mockResolvedValue([[1, 0]]);
    client.getCollection.mockResolvedValue({});
    client.scroll.mockResolvedValue({ points: [], next_page_offset: null });
    client.retrieve.mockResolvedValue([]);
    client.search.mockResolvedValue([]);
  });

  it('creates the collection when missing and upserts new documents', async () => {
    client.getCollection.mockRejectedValueOnce({ status: 404 });
    (embeddings.embed as ReturnType<typeof vi.fn>).mockResolvedValue([[0.1, 0.2]]);

    const store = new QdrantVectorStore({
      collection: 'skills',
      dimensions: 2,
      embeddings,
      client: client as unknown as never
    });

    await store.indexSkills([{ id: 'alpha', text: 'Skill text' }]);

    expect(client.createCollection).toHaveBeenCalledWith('skills', {
      vectors: { size: 2, distance: 'Cosine' }
    });
    expect(client.upsert).toHaveBeenCalledWith('skills', {
      wait: true,
      points: [
        {
          id: 'alpha',
          payload: { hash: expect.any(String), metadata: undefined, metadataDigest: undefined },
          vector: [0.1, 0.2]
        }
      ]
    });
  });

  it('skips embedding when hash matches existing payload', async () => {
    client.retrieve.mockResolvedValue([
      {
        id: 'alpha',
        payload: {
          hash: '70840fcfbf3b5c5964ceacaec0466d554d4bedeb7f07d972cd80277e33aeb167',
          metadata: undefined,
          metadataDigest: undefined
        }
      }
    ]);

    const store = new QdrantVectorStore({
      collection: 'skills',
      dimensions: 2,
      embeddings,
      client: client as unknown as never
    });

    await store.indexSkills([{ id: 'alpha', text: 'Unchanged text' }]);

    expect(embeddings.embed).not.toHaveBeenCalled();
    expect(client.upsert).not.toHaveBeenCalled();
  });

  it('deletes stale points when documents are removed', async () => {
    client.scroll.mockResolvedValue({
      points: [{ id: 'beta' }],
      next_page_offset: null
    });
    (embeddings.embed as ReturnType<typeof vi.fn>).mockResolvedValue([[0.4, 0.6]]);

    const store = new QdrantVectorStore({
      collection: 'skills',
      dimensions: 2,
      embeddings,
      client: client as unknown as never
    });

    await store.indexSkills([{ id: 'alpha', text: 'Keep this' }]);

    expect(client.delete).toHaveBeenCalledWith('skills', { points: ['beta'] });
  });

  it('returns search results including metadata', async () => {
    (embeddings.embed as ReturnType<typeof vi.fn>).mockResolvedValueOnce([[0.5, 0.5]]);
    client.search.mockResolvedValue([
      {
        id: 'alpha',
        score: 0.9,
        payload: { metadata: { id: 'alpha', name: 'Alpha' } }
      }
    ]);

    const store = new QdrantVectorStore({
      collection: 'skills',
      dimensions: 2,
      embeddings,
      client: client as unknown as never
    });

    const results = await store.search('query', { limit: 3 });

    expect(embeddings.embed).toHaveBeenCalledWith(['query']);
    expect(results).toEqual([
      {
        skillId: 'alpha',
        score: 0.9,
        metadata: { id: 'alpha', name: 'Alpha' }
      }
    ]);
  });
});
