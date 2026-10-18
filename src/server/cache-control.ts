// Data changes a few times a day at most, and nothing is per-user, so the CDN
// may share responses: fresh for 10 minutes, then served stale while it
// refreshes in the background. Kept import-free so routes can use it.
export const CACHE_CONTROL = "public, s-maxage=600, stale-while-revalidate=86400";
