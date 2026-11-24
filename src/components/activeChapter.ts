// Which chapter the sticky rail and phone bar should show.
//
// `visible` holds the chapters currently in the reading band, `tops` each
// chapter's distance from the viewport top (null when it is not on the page)
// and `bandTop` is where the band starts.
export function pickActiveChapter(
  slugs: readonly string[],
  visible: ReadonlySet<string>,
  tops: readonly (number | null)[],
  bandTop: number,
  current: string,
): string {
  const inBand = slugs.find((s) => visible.has(s));
  if (inBand) return inBand;
  // Above chapter 01 nothing is in the band: name the first chapter rather
  // than whichever was last active (the last one, after a reload).
  const first = tops[0];
  if (first != null && first > bandTop && slugs[0]) return slugs[0];
  // In a gap between two chapters: the last one that has scrolled past the
  // band's top, which stays right even after a jump that skipped the band.
  for (let i = slugs.length - 1; i >= 0; i--) {
    const top = tops[i];
    if (top != null && top <= bandTop) return slugs[i] ?? current;
  }
  return current;
}
