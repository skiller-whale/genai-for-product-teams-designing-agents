import { KB_DOCS, type KbDoc } from '../scenario';

// Deliberately simple keyword-overlap search (no embeddings, no index): it is
// deterministic, easy to reason about in a session, and its limitations are
// themselves instructive — vague queries return vague snippets.

export interface KbSearchHit {
  docId: string;
  title: string;
  snippet: string;
  score: number;
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was',
  'one', 'our', 'out', 'has', 'have', 'what', 'when', 'how', 'who', 'why',
  'this', 'that', 'with', 'from', 'they', 'them', 'their', 'your', 'about',
  'does', 'much', 'many', 'will', 'would', 'there', 'than', 'then', 'get',
]);

function terms(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9£]+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

function paragraphs(doc: KbDoc): string[] {
  return doc.content
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function scoreText(queryTerms: string[], text: string): number {
  const haystack = text.toLowerCase();
  let score = 0;
  for (const term of queryTerms) {
    if (haystack.includes(term)) score += 1;
  }
  return score;
}

/** Return the best-matching snippets across the knowledge base. */
export function searchKb(query: string, maxHits = 3): KbSearchHit[] {
  const queryTerms = terms(query);
  if (queryTerms.length === 0) return [];

  const hits: KbSearchHit[] = [];
  for (const doc of KB_DOCS) {
    const paras = paragraphs(doc);
    let best: { snippet: string; score: number } | null = null;
    for (const para of paras) {
      // Weight the doc title too: a query naming the doc should find it even
      // when an individual paragraph phrases things differently.
      const score = scoreText(queryTerms, para) + scoreText(queryTerms, doc.title) * 0.5;
      if (score > 0 && (!best || score > best.score)) {
        best = { snippet: para, score };
      }
    }
    if (best) {
      hits.push({ docId: doc.id, title: doc.title, snippet: best.snippet, score: best.score });
    }
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, maxHits);
}

export function formatKbHits(hits: KbSearchHit[]): string {
  if (hits.length === 0) {
    return 'No matching passages found in the knowledge base. Try different words, or use read_document to read a whole document.';
  }
  return hits
    .map(
      (hit) =>
        `[document: ${hit.docId} — "${hit.title}"]\n${hit.snippet}`,
    )
    .join('\n\n---\n\n');
}
