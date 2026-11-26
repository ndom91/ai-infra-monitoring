import { Chart, Tooltip } from "chart.js";

// Canvas charts cannot read CSS variables cheaply, so their colours live
// here. These mirror the tokens in src/styles.css and must match them.
export const GRID = "#1f1f22"; // --chart-grid
export const TICK = "#83838a"; // --chart-tick
// Fill of hollow (calculated) points: the page background, --bg.
export const HOLLOW = "#0b0b0c";
const SURFACE = "#141415"; // --surface
const LINE = "#2c2c2f"; // --line
const TEXT = "#f2f2f2"; // --text
const READING = "#c9c9cc"; // --reading

export const LINE_WIDTH = 1.8;

// Every chart module imports this file, so these apply before any chart draws.
// The tooltip defaults exist only once the plugin is registered.
Chart.register(Tooltip);
Chart.defaults.font.family = '"Instrument Sans Variable", system-ui, sans-serif';
Chart.defaults.font.size = 11;
Chart.defaults.color = TICK;
Object.assign(Chart.defaults.plugins.tooltip, {
  backgroundColor: SURFACE,
  borderColor: LINE,
  borderWidth: 1,
  cornerRadius: 8,
  titleColor: TEXT,
  bodyColor: READING,
  padding: 10,
});
