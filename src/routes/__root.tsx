import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  Scripts,
  useLocation,
  useRouter,
} from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";
import { ExternalLink } from "~/components/ExternalLink";
import { useSlidingIndicator } from "~/components/useSlidingIndicator";
import { DEFAULT_IMAGE, SITE_NAME, SITE_URL } from "~/lib/seo";
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
      { name: "robots", content: "index, follow" },
      { name: "theme-color", content: "#0b0b0c" },
      { property: "og:title", content: "Artificial Liabilities | AI Infrastructure Risk Research" },
      {
        property: "og:description",
        content: "Tracking the balance sheet behind the AI build-out.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: SITE_URL },
      { property: "og:site_name", content: SITE_NAME },
      { property: "og:image", content: DEFAULT_IMAGE },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: SITE_NAME },
      { name: "twitter:card", content: "summary_large_image" },
      {
        name: "twitter:title",
        content: "Artificial Liabilities | AI Infrastructure Risk Research",
      },
      {
        name: "twitter:description",
        content: "Tracking the balance sheet behind the AI build-out.",
      },
      { name: "twitter:image", content: DEFAULT_IMAGE },
      { name: "twitter:image:alt", content: SITE_NAME },
      {
        "script:ld+json": {
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: SITE_NAME,
          url: SITE_URL,
          description: "Research on the balance sheet behind the AI build-out.",
        },
      },
    ],
    links: [
      { rel: "stylesheet", href: styles },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "manifest", href: "/site.webmanifest" },
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
  return (
    <RootDocument>
      <div className="wrap">
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <header className="topbar">
          <Link to="/" className="brand">
            <span className="kicker">Tracking the balance sheet behind the AI build-out</span>
            <span className="brand-name">Artificial Liabilities</span>
          </Link>
          <SiteNav />
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

function SiteNav() {
  const pathname = useLocation({ select: (l) => l.pathname });
  // The active pill slides between pages (transitions.dev tabs sliding).
  const { bar: navRef, indicator } = useSlidingIndicator<HTMLElement>(pathname);

  const router = useRouter();

  // On phones the nav is a horizontal strip; keep the active tab visible
  // without touching the page's vertical scroll (scrollIntoView would).
  // biome-ignore lint/correctness/useExhaustiveDependencies: navRef is a stable ref.
  useEffect(() => {
    const center = () => {
      const nav = navRef.current;
      const active = nav?.querySelector<HTMLElement>("a.active");
      if (!nav || !active || nav.scrollWidth <= nav.clientWidth) return;
      const target = active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2;
      nav.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
    };
    center();
    // The router restores every scrolled element after a page renders, which
    // would snap the strip back mid-scroll. Centre after that restore.
    return router.subscribe("onRendered", center);
  }, [router]);

  return (
    <nav className="nav" ref={navRef} aria-label="Main">
      <span ref={indicator} className="t-ind" aria-hidden="true" />
      {NAV.map((n) => (
        <Link
          key={n.to}
          to={n.to}
          activeOptions={{ exact: n.to === "/", includeSearch: false }}
          activeProps={{ className: "active" }}
          // Reserves the bold width; see .nav a::after.
          data-label={n.label}
        >
          {n.label}
        </Link>
      ))}
      <ExternalLink className="nav-github" href="https://github.com/ndom91/ai-infra-monitoring">
        <span className="sr-only">GitHub repository</span>
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.683-.217.683-.481 0-.237-.009-.866-.013-1.699-2.782.604-3.369-1.34-3.369-1.34-.455-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.004.071 1.532 1.031 1.532 1.031.892 1.529 2.341 1.087 2.91.831.091-.646.349-1.087.635-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.092.39-1.986 1.029-2.686-.103-.253-.446-1.271.098-2.65 0 0 .84-.269 2.75 1.026A9.564 9.564 0 0 1 12 6.756a9.59 9.59 0 0 1 2.504.337c1.909-1.295 2.748-1.026 2.748-1.026.546 1.379.203 2.397.1 2.65.64.7 1.028 1.594 1.028 2.686 0 3.842-2.339 4.687-4.566 4.935.359.309.678.92.678 1.852 0 1.337-.012 2.418-.012 2.747 0 .267.18.578.688.48A10.003 10.003 0 0 0 22 12c0-5.523-4.477-10-10-10Z" />
        </svg>
      </ExternalLink>
    </nav>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <script
          src="https://stats.ndo.dev/api/script.js"
          data-site-id="bd9b4d637e04"
          defer
          fetchPriority="low"
        />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
