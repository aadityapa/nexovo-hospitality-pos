/**
 * Chart theme — keeps Recharts in step with the design tokens.
 *
 * Recharts needs literal colour values, so these mirror tailwind.config.ts. Import from here
 * rather than hardcoding hex in a page, so a palette change stays a one-file change.
 */
export const CHART = {
  primary: '#087F8C',
  primaryLight: '#34A0AA',
  primaryFill: '#087F8C',
  grid: '#E4E7EC',
  axis: '#667085',
  success: '#12B76A',
  warning: '#F79009',
  danger: '#F04438',
  info: '#2E90FA',
  accent: '#DB9A2E',
} as const;

/** Categorical series colours, ordered for maximum separation between neighbours. */
export const CHART_SERIES = [
  '#087F8C', '#2E90FA', '#DB9A2E', '#12B76A', '#6BBDC4', '#B54708', '#98A2B3', '#175CD3',
] as const;

/** Shared axis styling so every chart reads the same way. */
export const axisProps = {
  tick: { fontSize: 11, fill: CHART.axis },
  tickLine: false,
  axisLine: { stroke: CHART.grid },
} as const;

export const gridProps = {
  strokeDasharray: '3 3',
  stroke: CHART.grid,
  vertical: false,
} as const;

/** Tooltip styling that matches the popover surface. */
export const tooltipProps = {
  contentStyle: {
    borderRadius: 10,
    border: '1px solid #E4E7EC',
    boxShadow: '0 8px 24px -6px rgba(16,24,40,0.16)',
    fontSize: 12,
    padding: '8px 12px',
  },
  labelStyle: { color: '#182230', fontWeight: 600, marginBottom: 2 },
  cursor: { fill: 'rgba(8,127,140,0.06)' },
} as const;

/** Compact currency for axis ticks (₹12.5k) — full precision stays in tooltips and tables. */
export const compactMoney = (v: number): string => {
  const abs = Math.abs(v);
  if (abs >= 10_000_000) return `₹${(v / 10_000_000).toFixed(1)}Cr`;
  if (abs >= 100_000) return `₹${(v / 100_000).toFixed(1)}L`;
  if (abs >= 1_000) return `₹${(v / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return `₹${Math.round(v)}`;
};
