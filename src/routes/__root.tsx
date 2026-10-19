import { createRootRoute, HeadContent, Link, Outlet, Scripts } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { formatDate } from "~/lib/format";
import { CACHE_CONTROL } from "~/server/cache-control";
import { getLastUpdated } from "~/server/data";
import styles from "~/styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Artificial Liabilities | AI Infrastructure Risk Research" },
      {
        name: "description",
        content: "Tracking the balance sheet behind the AI build-out.",
      },
      { name: "theme-color", content: "#0e1113" },
    ],
    links: [
      { rel: "stylesheet", href: styles },
      {
        rel: "icon",
        href: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><rect width='16' height='16' rx='3' fill='%23b5e1cd'/></svg>",
      },
    ],
  }),
  headers: () => ({ "Cache-Control": CACHE_CONTROL }),
  // Cheap single-row query; cached briefly so client navigation doesn't refetch it.
  loader: () => getLastUpdated(),
  staleTime: 5 * 60_000,
  component: RootComponent,
});

const NAV = [
  { to: "/", label: "Overview" },
  { to: "/market", label: "Market" },
  { to: "/credit", label: "Credit" },
  { to: "/infrastructure", label: "Infrastructure" },
  { to: "/fundamentals", label: "Fundamentals" },
  { to: "/alerts", label: "Alerts" },
  { to: "/coverage", label: "Coverage" },
] as const;

function RootComponent() {
  const lastUpdated = Route.useLoaderData();
  return (
    <RootDocument>
      <div className="wrap">
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <header className="topbar">
          <Link to="/" className="brand">
            <span className="kicker">Tracking the balance sheet behind the AI build-out</span>
            <span className="brand-name">
              Artificial Liabilities<span className="accent">.</span>
            </span>
          </Link>
          {lastUpdated && <span className="topbar-updated">Updated {formatDate(lastUpdated)}</span>}
          <nav className="nav">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                activeOptions={{ exact: n.to === "/", includeSearch: false }}
                activeProps={{ className: "active" }}
              >
                {n.label}
              </Link>
            ))}
            <a
              className="nav-github"
              href="https://github.com/ndom91/ai-infra-monitoring"
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub repository (opens in a new tab)"
            >
              <span className="sr-only">GitHub repository (opens in a new tab)</span>
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.683-.217.683-.481 0-.237-.009-.866-.013-1.699-2.782.604-3.369-1.34-3.369-1.34-.455-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.004.071 1.532 1.031 1.532 1.031.892 1.529 2.341 1.087 2.91.831.091-.646.349-1.087.635-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.092.39-1.986 1.029-2.686-.103-.253-.446-1.271.098-2.65 0 0 .84-.269 2.75 1.026A9.564 9.564 0 0 1 12 6.756a9.59 9.59 0 0 1 2.504.337c1.909-1.295 2.748-1.026 2.748-1.026.546 1.379.203 2.397.1 2.65.64.7 1.028 1.594 1.028 2.686 0 3.842-2.339 4.687-4.566 4.935.359.309.678.92.678 1.852 0 1.337-.012 2.418-.012 2.747 0 .267.18.578.688.48A10.003 10.003 0 0 0 22 12c0-5.523-4.477-10-10-10Z" />
              </svg>
            </a>
          </nav>
        </header>
        <main id="main-content" tabIndex={-1}>
          <Outlet />
        </main>
        <footer className="site-foot">
          Research, not investment advice. Every number comes from a public source. Nothing is
          estimated; calculated figures are labelled.
        </footer>
      </div>
    </RootDocument>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
