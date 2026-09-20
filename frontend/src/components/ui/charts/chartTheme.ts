import type { BadgeTone } from '@/components/ui/Badge'

/**
 * Recharts принимает `fill`/`stroke` только как CSS-цвет, не Tailwind-класс
 * — `barClassName`/`badgeToneBarClass` тут не годятся. Ссылки на
 * `--chart-*`-токены (globals.css) вместо hex: тема меняется вместе с
 * `data-theme`, без повторного вычисления цвета в JS.
 */
const TONE_CHART_COLOR: Record<BadgeTone, string> = {
  neutral: 'var(--chart-axis)',
  info: 'var(--chart-info)',
  success: 'var(--chart-success)',
  warning: 'var(--chart-warm)',
  danger: 'var(--chart-danger)',
}

export function toneChartColor(tone: BadgeTone): string {
  return TONE_CHART_COLOR[tone]
}

export const CHART_GRID_COLOR = 'var(--chart-grid)'
export const CHART_AXIS_COLOR = 'var(--chart-axis)'
export const CHART_TOOLTIP_BG = 'var(--chart-tooltip-bg)'
