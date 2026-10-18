import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    // Data changes a few times a day; revisiting a page within 5 minutes
    // reuses what was loaded. Hovering a link starts loading its page.
    defaultStaleTime: 5 * 60_000,
    defaultPreload: "intent",
  });
}
