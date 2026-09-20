/**
 * Lightweight retrieval-augmented generation (RAG) layer.
 *
 * This is a deliberately dependency-free stand-in for a vector database
 * (pgvector/Pinecone/Qdrant, per the problem statement's "or equivalent").
 * It chunks each knowledge markdown file into paragraphs, then scores every
 * paragraph against a query by keyword overlap (a bag-of-words / TF-style
 * score) and returns the top matches. No embeddings API, no paid service,
 * no network call — so it works identically online or fully offline, and
 * is honest about what it is: real retrieval over real documents, not a
 * hallucinated citation, but not semantic/vector search either.
 *
 * Swap `score()` for a real embedding-similarity search and nothing else
 * in the agent pipeline needs to change — callers only see `retrieve()`.
 */
const fs = require("fs");
const path = require("path");

const KB_DIR = path.join(__dirname, "..", "..", "data", "knowledge");

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "is", "are",
  "this", "that", "it", "as", "at", "by", "be", "was", "were", "your", "you", "we",
  "our", "their", "them", "his", "her", "its", "not", "no", "if", "so", "than",
]);

function tokenize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

let _cache = null;

function loadChunks() {
  if (_cache) return _cache;
  const chunks = [];
  const files = fs.existsSync(KB_DIR) ? fs.readdirSync(KB_DIR).filter((f) => f.endsWith(".md")) : [];
  for (const file of files) {
    const text = fs.readFileSync(path.join(KB_DIR, file), "utf8");
    const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    let heading = file.replace(/\.md$/, "");
    for (const para of paragraphs) {
      const headingMatch = para.match(/^#{1,3}\s+(.*)$/m);
      if (headingMatch && para.split("\n").length <= 2) {
        heading = headingMatch[1];
        continue; // heading-only chunk, not a retrievable answer on its own
      }
      chunks.push({
        source: file,
        heading,
        text: para,
        tokens: tokenize(para),
      });
    }
  }
  _cache = chunks;
  return chunks;
}

function score(queryTokens, chunkTokens) {
  if (!chunkTokens.length) return 0;
  const set = new Set(chunkTokens);
  let hits = 0;
  for (const t of queryTokens) if (set.has(t)) hits += 1;
  // Reward proportional overlap, not raw hits, so a short precise chunk
  // beats a long chunk that happens to share a couple of common words.
  return hits / Math.sqrt(chunkTokens.length);
}

/**
 * Retrieves the top `topK` knowledge chunks relevant to `query` (free text
 * — usually the prospect's title/company/industry plus the campaign
 * objective). Returns [] if nothing scores above a small relevance floor,
 * so callers can tell "no knowledge found" apart from "found something."
 */
function retrieve(query, topK = 3) {
  const chunks = loadChunks();
  const queryTokens = tokenize(query);
  if (!queryTokens.length) return [];
  const scored = chunks
    .map((c) => ({ ...c, score: score(queryTokens, c.tokens) }))
    .filter((c) => c.score > 0.15)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).map(({ tokens, ...rest }) => rest);
}

module.exports = { retrieve };
