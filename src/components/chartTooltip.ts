type TooltipValue = { parsed: { y: number | null } };

export function sortTooltipDescending(a: TooltipValue, b: TooltipValue) {
  return (b.parsed.y ?? -Infinity) - (a.parsed.y ?? -Infinity);
}
