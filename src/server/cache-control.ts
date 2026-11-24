// Data changes a few times a day at most, and nothing is per-user, so the CDN
// may share responses. A page is fresh for 20 minutes, then may be served for
// up to 6 hours in total while it is revalidated in the background.
// Kept import-free so routes can use it.
export const FRESH_SECONDS = 20 * 60;
export const MAX_AGE_SECONDS = 6 * 60 * 60;

export const CACHE_CONTROL = `public, s-maxage=${FRESH_SECONDS}, stale-while-revalidate=${MAX_AGE_SECONDS}`;
