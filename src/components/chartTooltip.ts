type TooltipValue = { parsed: { y: number | null } };

export function sortTooltipDescending(a: TooltipValue, b: TooltipValue) {
  return (b.parsed.y ?? -Infinity) - (a.parsed.y ?? -Infinity);
}

// Hollow markers and a tooltip suffix mark points that are not straight from
// a source. Reported and hand-entered (cited) figures are not derived. The
// server leaves `kind` out when it is "reported".
export function isDerivedKind(kind: string | undefined) {
  return kind !== undefined && kind !== "reported" && kind !== "manual";
}
