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
      { title: "Infrastructure Risk Monitor" },
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
        <header className="topbar">
          <Link to="/" className="brand">
            <span className="kicker">AI capital cycle</span>
            <span className="brand-name">
              Infrastructure Risk Monitor<span className="accent">.</span>
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
          </nav>
        </header>
        <main>
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
