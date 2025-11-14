import crypto from 'node:crypto';
import { Config } from '../config';

export interface EmbeddingsProvider {
  embed(texts: string[]): Promise<number[][]>;
}

export interface OpenAIProviderOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly baseUrl?: string;
  readonly dimensions?: number;
}

export class OpenAIEmbeddingsProvider implements EmbeddingsProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly dimensions?: number;

  constructor(options: OpenAIProviderOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.baseUrl = options.baseUrl ?? 'https://api.openai.com/v1';
    this.dimensions = options.dimensions;
  }

  public async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
        dimensions: this.dimensions
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI embeddings request failed: ${response.status} ${body}`);
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[] }>;
    };

    return data.data.map((item) => item.embedding);
  }
}

export class LocalEmbeddingsProvider implements EmbeddingsProvider {
  private readonly dimensions: number;

  constructor(dimensions = 64) {
    this.dimensions = dimensions;
  }

  public async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => this.createVector(text));
  }

  private createVector(text: string): number[] {
    const hash = crypto.createHash('sha256').update(text).digest();
    const vector: number[] = [];
    for (let i = 0; i < this.dimensions; i += 1) {
      const byte = hash[i % hash.length];
      vector.push((byte / 255) * 2 - 1);
    }
    return vector;
  }
}

export const createEmbeddingsProvider = (config: Config): EmbeddingsProvider => {
  if (config.embeddings.provider.toLowerCase() === 'openai') {
    if (!config.embeddings.apiKey) {
      throw new Error('OPENAI_API_KEY is required for OpenAI embeddings provider');
    }
    return new OpenAIEmbeddingsProvider({
      apiKey: config.embeddings.apiKey,
      model: config.embeddings.model,
      baseUrl: config.embeddings.baseUrl,
      dimensions: config.embeddings.dimensions
    });
  }

  const dimensions = config.embeddings.dimensions ?? 64;
  return new LocalEmbeddingsProvider(dimensions);
};
