/** String helpers for "did you mean" suggestions. */

/** Return the Levenshtein edit distance between two strings. */
export function editDistance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[b.length];
}

/**
 * Return the candidate closest to a word, ignoring case, or undefined if none is close enough to
 * be what was meant: at most a third of the word's length away, and at least 1 edit for short words.
 */
export function closest(
  word: string,
  candidates: string[],
): string | undefined {
  const lower = word.toLowerCase();
  let best: string | undefined;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const distance = editDistance(lower, candidate.toLowerCase());
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  const limit = Math.max(1, Math.floor(word.length / 3));
  return best !== undefined && bestDistance <= limit ? best : undefined;
}
