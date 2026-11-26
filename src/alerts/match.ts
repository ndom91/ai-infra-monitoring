// A rule's `series` pattern: an exact id, or a prefix ending in "*".
// Kept free of Node imports so browser code can use it.
export function matchesSeries(pattern: string, id: string) {
  return pattern.endsWith("*") ? id.startsWith(pattern.slice(0, -1)) : pattern === id;
}
