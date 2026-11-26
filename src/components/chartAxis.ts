import { GRID, TICK } from "./chartTheme";

export { GRID, TICK };

// One time axis for every chart, so charts side by side read the same.
// Labels never rotate and auto-skip keeps a real gap between neighbours, which
// also thins the ticks on a narrow chart. Chart.js formats month ticks with
// the "month" format, so months and quarters share one.
export function timeAxis(minUnit: "day" | "month" = "day") {
  return {
    type: "time" as const,
    time: {
      minUnit,
      tooltipFormat: "d MMM yyyy",
      displayFormats: {
        day: "d MMM",
        week: "d MMM",
        month: "MMM yyyy",
        quarter: "MMM yyyy",
        year: "yyyy",
      },
    },
    ticks: {
      color: TICK,
      maxTicksLimit: 7,
      maxRotation: 0,
      minRotation: 0,
      autoSkip: true,
      autoSkipPadding: 28,
    },
    grid: { display: false },
  };
}
