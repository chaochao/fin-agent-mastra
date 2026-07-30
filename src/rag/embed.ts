// Embeddings via BGE-M3 on local Ollama. DeepSeek has no embeddings API, so this is
// the "embedder" half of the RAG split (embedder retrieves, DeepSeek generates).
// Reused by both ingest (Day 4) and the search tool (Day 5).
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
export const EMBED_MODEL = 'bge-m3';
export const EMBED_DIM = 1024; // MUST match the vector index dimension

export async function embed(text: string): Promise<number[]> {
  const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
  });
  if (!res.ok) {
    throw new Error(`Ollama embed failed (${res.status}): ${await res.text()}. Is 'ollama' running and is bge-m3 pulled?`);
  }
  const json = (await res.json()) as { embedding?: number[] };
  if (!Array.isArray(json.embedding) || json.embedding.length !== EMBED_DIM) {
    throw new Error(`Unexpected embedding shape from Ollama (got ${json.embedding?.length} dims, expected ${EMBED_DIM}).`);
  }
  return json.embedding;
}

// Sequential on purpose: our corpus is tiny, and this avoids hammering local Ollama.
export async function embedMany(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (const t of texts) out.push(await embed(t));
  return out;
}
