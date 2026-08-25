const WORD_PATTERN = /[\p{L}\p{N}\p{M}\p{Pc}'-]+/gu;
const CJK_RUN_PATTERN = /[\u3400-\u9fff\uf900-\ufaff]+/gu;
const CJK_ONLY_PATTERN = /^[\u3400-\u9fff\uf900-\ufaff]+$/u;
const TOKEN_SEGMENT_PATTERN =
  /[\u3400-\u9fff\uf900-\ufaff]+|[^\u3400-\u9fff\uf900-\ufaff]+/gu;

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function createCjkSearchTerms(texts: readonly string[]): string[] {
  const terms: string[] = [];

  for (const text of texts) {
    for (const match of text.matchAll(CJK_RUN_PATTERN)) {
      const characters = Array.from(match[0]);
      terms.push(...characters);
      for (let index = 0; index < characters.length - 1; index += 1) {
        terms.push(`${characters[index]}${characters[index + 1]}`);
      }
    }
  }

  return unique(terms);
}

function quoteFtsTerm(term: string): string {
  return `"${term.replaceAll('"', '""')}"`;
}

export function createFtsQuery(query: string): string | null {
  const normalized = query.normalize("NFKC").trim().slice(0, 200);
  if (!normalized) return null;

  const terms: string[] = [];
  for (const match of normalized.matchAll(WORD_PATTERN)) {
    for (const segment of match[0].matchAll(TOKEN_SEGMENT_PATTERN)) {
      const token = segment[0].toLocaleLowerCase();
      if (CJK_ONLY_PATTERN.test(token)) {
        const characters = Array.from(token);
        if (characters.length <= 2) {
          terms.push(token);
        } else {
          for (let index = 0; index < characters.length - 1; index += 1) {
            terms.push(`${characters[index]}${characters[index + 1]}`);
          }
        }
      } else {
        terms.push(`${quoteFtsTerm(token)}*`);
      }
    }
  }

  const expressions = unique(terms).map((term) =>
    term.endsWith("*") ? term : quoteFtsTerm(term),
  );
  return expressions.length ? expressions.join(" AND ") : null;
}
