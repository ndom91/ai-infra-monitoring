import { useLocation } from "@tanstack/react-router";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { SIGNAL_LABELS, type Signal } from "~/domain/chapterSignals";
import { pickActiveChapter } from "./activeChapter";
import { Chevron, Disclosure } from "./Disclosure";
import { SignalDot, SignalLegend } from "./SignalDot";
import { type Stat, StatList } from "./StatList";
import { isPlainClick, useScrollToChapter } from "./scrollToChapter";
import { useSlidingIndicator } from "./useSlidingIndicator";

export type ChapterDef = {
  slug: string;
  label: string;
  // Cadence or scope, shown under the label in the rail and the sheet.
  sub: string;
  signal: Signal;
};

const pad = (n: number) => String(n).padStart(2, "0");

// A warning shown after the eyebrow's cadence text.
export type ChapterStatus = { tone: "worsening" | "mixed"; label: string };

// Only worsening and mixed chapters carry a status; calm ones stay quiet.
const statusOf = (signal: Signal): ChapterStatus | null =>
  signal === "worsening" || signal === "mixed"
    ? { tone: signal, label: SIGNAL_LABELS[signal] }
    : null;

export function ChapterHeader({
  index,
  total,
  chapter,
  meta,
  question,
  watchFor,
  lede,
  stats = [],
  status = statusOf(chapter.signal),
}: {
  index: number;
  total: number;
  chapter: ChapterDef;
  // Defaults to the chapter's own signal; the homepage passes its step status.
  status?: ChapterStatus | null;
  // "Daily · FRED"; desktop eyebrow only.
  meta?: string;
  question: string;
  // Either a "Watch for" line or, for chapters without one, a plain lede.
  watchFor?: ReactNode;
  lede?: ReactNode;
  stats?: Stat[];
}) {
  return (
    <header className="chapter-head">
      <div className="chapter-head-text">
        <p className="chapter-eyebrow">
          <span className="chapter-num">{pad(index)}</span>
          <span className="chapter-total">/{pad(total)}</span>
          {/* Spaces keep the read-aloud text apart; CSS sets the visual gaps. */}{" "}
          <span className="chapter-eyebrow-label">{chapter.label}</span>
          {meta ? <span className="chapter-eyebrow-meta"> {meta}</span> : null}
          {status ? (
            <span className={`chapter-eyebrow-status sig-${status.tone}`}>
              {" "}
              <span className="chapter-eyebrow-dot" aria-hidden="true" />
              {status.label}
            </span>
          ) : null}
        </p>
        <h2>{question}</h2>
        {watchFor ? (
          <p className="chapter-watch">
            <b>Watch for:</b> {watchFor}
          </p>
        ) : null}
        {lede ? <p className="chapter-watch">{lede}</p> : null}
      </div>
      {stats.length > 0 ? (
        <div className="chapter-head-stats">
          <StatList stats={stats} />
        </div>
      ) : null}
    </header>
  );
}

export function Chapter({ chapter, children }: { chapter: ChapterDef; children: ReactNode }) {
  return (
    // tabIndex lets the phone sheet move focus here after a chapter is chosen.
    <section id={chapter.slug} className="chapter" aria-label={chapter.label} tabIndex={-1}>
      {children}
    </section>
  );
}

export function ChapterCharts({ children, one }: { children: ReactNode; one?: boolean }) {
  return <div className={`chapter-charts${one ? " one" : ""}`}>{children}</div>;
}

// Collapsed charts mount only once opened, so Chart.js does no work for
// charts nobody asked to see.
// Disclosures at the foot of a chapter ("Show more", "How to read this"),
// side by side instead of stacked.
export function ChapterFooter({ children }: { children: ReactNode }) {
  return <div className="chapter-footer">{children}</div>;
}

export function ChapterMore({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <Disclosure className="chapter-more" summary={summary} lazy>
      <div className="chapter-more-body">{children}</div>
    </Disclosure>
  );
}

// The reading band starts this share of the viewport height from the top.
const BAND_TOP = 0.15;

// The chapter whose section is nearest the top of the viewport.
function useActiveChapter(slugs: string[]) {
  const [active, setActive] = useState(slugs[0] ?? "");
  const key = slugs.join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands in for the slug list.
  useEffect(() => {
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.id);
          else visible.delete(e.target.id);
        }
        const tops = slugs.map(
          (s) => document.getElementById(s)?.getBoundingClientRect().top ?? null,
        );
        setActive((current) =>
          pickActiveChapter(slugs, visible, tops, window.innerHeight * BAND_TOP, current),
        );
      },
      // A band near the top third of the screen.
      { rootMargin: `-${BAND_TOP * 100}% 0px -60% 0px` },
    );
    for (const s of slugs) {
      const el = document.getElementById(s);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [key]);
  return active;
}

function ChapterList({
  chapters,
  active,
  onPick,
}: {
  chapters: ChapterDef[];
  active: string;
  onPick?: (slug: string) => void;
}) {
  // The highlight slides to the chapter in view as the page scrolls.
  const { bar, indicator } = useSlidingIndicator<HTMLDivElement>(active);
  const scrollToChapter = useScrollToChapter();
  return (
    // The indicator sits beside the list, not in it: an <ol> holds only <li>.
    <div ref={bar} className="chapter-list-wrap">
      <span ref={indicator} className="t-ind" aria-hidden="true" />
      <ol className="chapter-list">
        {chapters.map((c, i) => (
          <li key={c.slug}>
            <a
              href={`#${c.slug}`}
              aria-current={c.slug === active ? "location" : undefined}
              onClick={(e) => {
                if (!isPlainClick(e)) return;
                e.preventDefault();
                // The phone sheet scrolls once it has closed; see ChapterBar.
                if (onPick) onPick(c.slug);
                else scrollToChapter(c.slug);
              }}
            >
              <span className="chapter-list-num">{pad(i + 1)}</span>
              <span className="chapter-list-text">
                <span className="chapter-list-label">{c.label}</span>
                <span className="chapter-list-sub">{c.sub}</span>
              </span>
              <SignalDot signal={c.signal} labelHidden />
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}

const LEGEND: Signal[] = ["worsening", "mixed", "reassuring", "context"];

// A key with only "Context" in it explains nothing, so it is left out.
const hasStatusKey = (signals: Signal[]) => signals.some((s) => s !== "context");

// Layout A: sticky chapter rail on the left (desktop), a sticky chapter bar
// with a bottom sheet on phones.
export function ChapterLayout({
  chapters,
  picker,
  note,
  children,
}: {
  chapters: ChapterDef[];
  picker?: { heading: string; node: ReactNode };
  // A short caveat at the bottom of the rail.
  note?: ReactNode;
  children: ReactNode;
}) {
  const active = useActiveChapter(chapters.map((c) => c.slug));
  const used = LEGEND.filter((s) => chapters.some((c) => c.signal === s));
  return (
    <div className="chapter-layout">
      <aside className="chapter-rail" aria-label="On this page">
        <p className="rail-heading">On this page</p>
        <ChapterList chapters={chapters} active={active} />
        {hasStatusKey(used) ? <SignalLegend signals={used} /> : null}
        {picker ? (
          <div className="rail-picker">
            <p className="rail-heading">{picker.heading}</p>
            {picker.node}
          </div>
        ) : null}
        {note ? <p className="rail-note">{note}</p> : null}
      </aside>
      <div className="chapter-main">
        <MobileChapterBar chapters={chapters} active={active} legend={used} />
        {children}
      </div>
    </div>
  );
}

// Phones only. Matches the 640 px breakpoint in styles.css.
const PHONE = "(max-width: 640px)";

function MobileChapterBar({
  chapters,
  active,
  legend,
}: {
  chapters: ChapterDef[];
  active: string;
  legend: Signal[];
}) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  // The chapter chosen in the sheet, so focus can follow the reader there.
  const picked = useRef<string | null>(null);
  const scrollToChapter = useScrollToChapter();
  const pathname = useLocation({ select: (l) => l.pathname });
  const index = Math.max(
    0,
    chapters.findIndex((c) => c.slug === active),
  );
  const current = chapters[index];

  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname closes the sheet after navigation.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const root = sheet.current;
    const focusables = () =>
      [...(root?.querySelectorAll<HTMLElement>("a[href], button") ?? [])].filter(
        (el) => !el.hasAttribute("disabled"),
      );
    (root?.querySelector<HTMLElement>("[aria-current]") ?? focusables()[0])?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const list = focusables();
      const first = list[0];
      const last = list.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKey);

    // The page must not scroll behind the sheet. Overflow keeps the scroll
    // position, so closing it puts the reader back exactly where they were.
    const { documentElement: html, body } = document;
    const before = [html.style.overflow, body.style.overflow];
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";

    // A sheet left open while the screen grows past a phone would reappear on shrink.
    const wide = window.matchMedia(PHONE);
    const onWide = () => {
      if (!wide.matches) setOpen(false);
    };
    wide.addEventListener("change", onWide);

    return () => {
      document.removeEventListener("keydown", onKey);
      wide.removeEventListener("change", onWide);
      html.style.overflow = before[0] ?? "";
      body.style.overflow = before[1] ?? "";
      const slug = picked.current;
      picked.current = null;
      // Scroll only now: the page cannot scroll while the sheet holds it.
      if (slug) scrollToChapter(slug);
      // After a pick, focus belongs to the chapter, not the bar above it.
      const target = slug ? document.getElementById(slug) : opener.current;
      target?.focus({ preventScroll: true });
    };
  }, [open, scrollToChapter]);

  return (
    <div className="chapter-bar">
      <span className="chapter-bar-current">
        <span className="chapter-num">{pad(index + 1)}</span>/{pad(chapters.length)} ·{" "}
        {current?.label}
      </span>
      <button
        ref={opener}
        type="button"
        className="chapter-bar-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        Chapters
        <Chevron />
      </button>
      {/* Both stay rendered so closing can animate; inert while closed. */}
      <div
        className="sheet-backdrop"
        data-open={open}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
      <div
        ref={sheet}
        className="sheet t-panel-slide"
        data-open={open}
        inert={!open}
        role="dialog"
        aria-modal="true"
        aria-labelledby="chapter-sheet-title"
      >
        <div className="sheet-head">
          <p id="chapter-sheet-title" className="rail-heading">
            Chapters
          </p>
          <button type="button" className="sheet-close" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
        <ChapterList
          chapters={chapters}
          active={active}
          onPick={(slug) => {
            picked.current = slug;
            setOpen(false);
          }}
        />
        {hasStatusKey(legend) ? <SignalLegend signals={legend} /> : null}
      </div>
    </div>
  );
}
