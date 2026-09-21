import type { CSSProperties } from 'react';
import type { ResolvedTheme } from '@/store/uiStore';
import { useRouteSurface } from '@/hooks/useSurface';

/**
 * Chart theme — keeps Recharts in step with the design tokens, in BOTH themes.
 *
 * Recharts needs literal colour values (it paints into SVG attributes, not CSS classes), so this
 * file is the ONE place in the app where hex is allowed outside the Tailwind config. Every value
 * below mirrors a token in tailwind.config.ts / styles/index.css; import from here rather than
 * hardcoding hex in a page, so a palette change stays a one-file change.
 *
 * TWO GROUNDS, ONE SHAPE. A chart is drawn on `surface-raised`, which is #11151A in dark and
 * #FFFFFF in light. A single fixed palette cannot serve both: the bright -500 rungs that carry a
 * dark chart disappear on white, and the -600/-700 rungs that carry a light chart disappear on
 * charcoal. So each theme gets its own set of literals, and `useChartTheme()` hands a component
 * the right one for the active theme. The SHAPE is identical, so a page spreads the same props
 * either way and never branches on the theme itself.
 *
 * Contrast of each series colour against the surface it is drawn on (WCAG non-text minimum 3:1):
 *   dark  on #11151A · #D6A84F 8.6 · #5CA9FF 7.4 · #39C98A 8.9 · #9A7BFF 5.4 · #F2B84B 10.3 · #E85D68 5.2
 *   light on #FFFFFF · #8A6212 5.5 · #1A66C4 5.6 · #039855 3.8 · #5B3BD1 7.0 · #C4860E 3.1 · #C62C37 5.5
 *
 * The legacy top-level exports (`CHART`, `CHART_SERIES`, `axisProps`, `gridProps`, `tooltipProps`)
 * remain, resolved for the dark theme, so callers that have not moved to the hook keep working
 * exactly as before.
 */

export interface ChartPalette {
  /** Gold — the primary series, and the only one that may carry a filled area. */
  primary: string;
  primaryLight: string;
  primaryFill: string;
  /** Hairline grid + axis lines — identical to `border-neutral-200` in that theme. */
  grid: string;
  /** Axis tick labels — identical to `text-neutral-500` in that theme. */
  axis: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  /** Violet — VIP classification only, never a generic "highlight". */
  accent: string;
}

export interface ChartTheme {
  CHART: ChartPalette;
  /**
   * Categorical series colours, ordered for maximum separation between neighbours.
   * Gold leads (it is the brand and the most common single-series case), then hue jumps as far as
   * possible each step so adjacent slices of a pie or stacked bar never blur together. The last
   * two are one rung further from the ground, for charts that need more than six.
   */
  CHART_SERIES: readonly string[];
  /** Shared axis styling so every chart reads the same way. */
  axisProps: {
    tick: { fontSize: number; fill: string };
    tickLine: false;
    axisLine: { stroke: string };
  };
  gridProps: { strokeDasharray: string; stroke: string; vertical: false };
  /** Tooltip styling that matches the `.popover` surface of the active theme exactly. */
  tooltipProps: {
    contentStyle: CSSProperties;
    labelStyle: CSSProperties;
    itemStyle: CSSProperties;
    /** The hover band behind the cursor — a gold wash, kept below the series it reveals. */
    cursor: { fill: string };
  };
}

interface ThemeSpec {
  palette: ChartPalette;
  series: readonly string[];
  /** `surface-high` — the popover ground the tooltip is painted on. */
  tooltipBg: string;
  /** `border-neutral-200` for the tooltip hairline, per the theme. */
  tooltipBorder: string;
  /** `text-neutral-900` / `text-neutral-700` inside the tooltip. */
  tooltipText: string;
  tooltipItemText: string;
  tooltipShadow: string;
  cursorFill: string;
}

/* DARK — charcoal ground. Every series is a bright -500 rung. */
const DARK: ThemeSpec = {
  palette: {
    primary: '#D6A84F',
    primaryLight: '#E9C778',
    primaryFill: '#D6A84F',
    grid: '#252C34',
    axis: '#8E98A3',
    success: '#39C98A',
    warning: '#F2B84B',
    danger: '#E85D68',
    info: '#5CA9FF',
    accent: '#9A7BFF',
  },
  series: ['#D6A84F', '#5CA9FF', '#39C98A', '#9A7BFF', '#F2B84B', '#E85D68', '#8CC4FF', '#6FDCAB'],
  tooltipBg: '#171C22',
  tooltipBorder: '#252C34',
  tooltipText: '#F4F5F6',
  tooltipItemText: '#C6CCD3',
  tooltipShadow: '0 12px 32px -8px rgba(0,0,0,0.65), 0 2px 8px -2px rgba(0,0,0,0.45)',
  cursorFill: 'rgba(214,168,79,0.10)',
};

/*
 * LIGHT — white ground. The gold keeps its identity but drops to the -700 rung for anything that
 * carries data: #D6A84F on white is 1.9:1 and would be a decorative smear rather than a line. The
 * translucent area fill under it stays the warmer -600 so the wash still reads as gold.
 */
const LIGHT: ThemeSpec = {
  palette: {
    primary: '#8A6212',
    primaryLight: '#C08F33',
    primaryFill: '#C08F33',
    grid: '#E1E6EC',
    axis: '#5A6472',
    success: '#039855',
    warning: '#C4860E',
    danger: '#C62C37',
    info: '#1A66C4',
    accent: '#5B3BD1',
  },
  series: ['#8A6212', '#1A66C4', '#039855', '#5B3BD1', '#C4860E', '#C62C37', '#14539E', '#027A48'],
  tooltipBg: '#FFFFFF',
  tooltipBorder: '#E1E6EC',
  tooltipText: '#0E141A',
  tooltipItemText: '#343C46',
  tooltipShadow: '0 12px 32px -8px rgba(16,24,40,0.18), 0 2px 8px -2px rgba(16,24,40,0.12)',
  cursorFill: 'rgba(138,98,18,0.08)',
};

function build(spec: ThemeSpec): ChartTheme {
  return {
    CHART: spec.palette,
    CHART_SERIES: spec.series,
    axisProps: {
      tick: { fontSize: 11, fill: spec.palette.axis },
      tickLine: false,
      axisLine: { stroke: spec.palette.grid },
    },
    gridProps: { strokeDasharray: '3 3', stroke: spec.palette.grid, vertical: false },
    tooltipProps: {
      contentStyle: {
        backgroundColor: spec.tooltipBg,
        borderRadius: 12,
        border: `1px solid ${spec.tooltipBorder}`,
        boxShadow: spec.tooltipShadow,
        color: spec.tooltipText,
        fontSize: 12,
        padding: '8px 12px',
      },
      labelStyle: { color: spec.tooltipText, fontWeight: 600, marginBottom: 2 },
      itemStyle: { color: spec.tooltipItemText },
      cursor: { fill: spec.cursorFill },
    },
  };
}

/*
 * Built once per theme at module load, so `useChartTheme()` returns a referentially stable object
 * and a chart does not re-render simply because its parent did.
 */
const THEMES: Record<ResolvedTheme, ChartTheme> = { dark: build(DARK), light: build(LIGHT) };

/** The chart palette for a given theme. Usable outside React (tests, print). */
export function chartThemeFor(theme: ResolvedTheme): ChartTheme {
  return THEMES[theme];
}

/**
 * The chart palette for the SURFACE THE CHART IS PAINTED ON — which is not always the theme.
 *
 * This used to read `resolvedTheme` straight from the ui store, and it was wrong the moment the
 * product gained per-route surfaces. Advanced reports is a warm ivory workspace inside the dark
 * product: under the dark theme the page is white, but the hook returned the dark palette, so the
 * gold series rendered at `#D6A84F` on white — 2.19:1, caught by the contrast audit at 1440. The
 * legend, the axis labels and the tooltip were all making the same mistake.
 *
 * `useRouteSurface()` already knows what the content region is painted in, having resolved the
 * route's declaration against the theme AND the viewport, so the chart asks it rather than the
 * store. Charts live in the content region, never in the rail, so the content axis is the right
 * one. Everything still repaints in step when the operator switches theme, because the surface
 * hook derives from the same store value.
 */
export function useChartTheme(): ChartTheme {
  return THEMES[useRouteSurface().contentIsDark ? 'dark' : 'light'];
}

/* ------------------------------------------------------------------------------------------- *
 * Legacy top-level exports — the dark resolution, kept for callers not yet on the hook.
 * ------------------------------------------------------------------------------------------- */
export const CHART: ChartPalette = THEMES.dark.CHART;
export const CHART_SERIES: readonly string[] = THEMES.dark.CHART_SERIES;
export const axisProps = THEMES.dark.axisProps;
export const gridProps = THEMES.dark.gridProps;
export const tooltipProps = THEMES.dark.tooltipProps;

/** Compact currency for axis ticks (₹12.5k) — full precision stays in tooltips and tables. */
export const compactMoney = (v: number): string => {
  const abs = Math.abs(v);
  if (abs >= 10_000_000) return `₹${(v / 10_000_000).toFixed(1)}Cr`;
  if (abs >= 100_000) return `₹${(v / 100_000).toFixed(1)}L`;
  if (abs >= 1_000) return `₹${(v / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return `₹${Math.round(v)}`;
};
