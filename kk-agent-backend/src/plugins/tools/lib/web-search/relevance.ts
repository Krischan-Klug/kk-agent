import type { WebSearchResult } from "./types.js";

const STOP_WORDS = new Set([
  "about", "and", "auf", "bei", "between", "das", "dem", "den", "der", "die", "does", "ein", "eine",
  "for", "from", "how", "ist", "mit", "oder", "the", "this", "und", "von", "was", "what", "wie", "with", "you",
]);

const REFINEMENT_NOISE = new Set([
  "comparison", "current", "difference", "documentation", "latest", "official", "version",
]);

const TERM_ALIASES: Record<string, string> = {
  compared: "comparison",
  comparisons: "comparison",
  differences: "difference",
  docs: "documentation",
  document: "documentation",
  releases: "release",
  versions: "version",
  vulnerabilities: "vulnerability",
};

function normalize(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase();
}

function searchQueryTerms(query: string): string[] {
  const withoutOperators = query.replace(/-?site:\S+/giu, " ");
  return [...new Set((normalize(withoutOperators).match(/[\p{L}\p{N}][\p{L}\p{N}.+#-]{1,}/gu) ?? [])
    .map((term) => term.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}+#.]+$/gu, ""))
    .map((term) => TERM_ALIASES[term] ?? term)
    .filter((term) => term.length >= 2 && !STOP_WORDS.has(term) && term !== "or"))];
}

function termMatches(haystack: string, term: string): boolean {
  if (haystack.includes(term)) return true;
  return term.length >= 5 && haystack.includes(term.slice(0, -1));
}

function scoreResult(result: WebSearchResult, terms: string[]): { score: number; matches: number } {
  const title = normalize(result.title);
  const snippet = normalize(result.snippet);
  const url = normalize(result.url);
  let score = 0;
  let matches = 0;
  for (const term of terms) {
    const inTitle = termMatches(title, term);
    const inSnippet = termMatches(snippet, term);
    const inUrl = termMatches(url, term);
    if (inTitle || inSnippet || inUrl) matches += 1;
    score += inTitle ? 5 : 0;
    score += inSnippet ? 2 : 0;
    score += inUrl ? 1 : 0;
  }
  return { score, matches };
}

export interface SearchQualityAssessment {
  results: WebSearchResult[];
  overlappingResultCount: number;
  queryTermCount: number;
  suspicious: boolean;
}

export function assessSearchQuality(query: string, results: WebSearchResult[]): SearchQualityAssessment {
  const terms = searchQueryTerms(query);
  if (terms.length === 0 || results.length === 0) {
    return {
      results,
      overlappingResultCount: results.length,
      queryTermCount: terms.length,
      suspicious: false,
    };
  }

  const ranked = results
    .map((result, index) => ({ result, index, ...scoreResult(result, terms) }))
    .sort((left, right) => right.matches - left.matches || right.score - left.score || left.index - right.index);
  const overlappingResultCount = ranked.filter((entry) => entry.matches > 0).length;

  return {
    results: ranked.map((entry) => entry.result),
    overlappingResultCount,
    queryTermCount: terms.length,
    suspicious: overlappingResultCount === 0,
  };
}

export function rankSearchResults(query: string, results: WebSearchResult[]): WebSearchResult[] {
  return assessSearchQuality(query, results).results;
}

export function refinedSearchQuery(query: string): string {
  const terms = searchQueryTerms(query);
  const decisive = terms.filter((term) => !REFINEMENT_NOISE.has(term));
  const selected = (decisive.length >= 2 ? decisive : terms).slice(0, 6);
  if (selected.length === 0) return query;
  return selected.map((term) => `"${term.replace(/"/gu, "")}"`).join(" ");
}
