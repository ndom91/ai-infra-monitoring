import { createServerOnlyFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { CACHE_CONTROL } from "./cache-control";

// For GET server functions (client-side navigation). SSR documents get the
// same header from the root route's `headers`.
export const cacheResponse = createServerOnlyFn(() => {
  setResponseHeader("Cache-Control", CACHE_CONTROL);
});
