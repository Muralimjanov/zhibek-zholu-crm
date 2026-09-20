'use client'

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type DotItemDotProps,
  type TooltipContentProps,
} from 'recharts'
import type { SalesLinePoint } from '@/features/reports/dashboardCharts'
import {
  formatChartAxisDate,
  formatChartFullDate,
} from '@/features/reports/dashboardCharts'
import ChartCard from './ChartCard'
import { CHART_AXIS_COLOR, CHART_GRID_COLOR } from './chartTheme'
import ChartTooltip from './ChartTooltip'

const SERIES = [
  { key: 'newBookings', label: 'Новые брони', color: 'var(--chart-brand)' },
  { key: 'newContracts', label: 'Новые договоры', color: 'var(--chart-info)' },
  {
    key: 'depositsPaid',
    label: 'Оплаченные взносы',
    color: 'var(--chart-warm)',
  },
] as const

/** Круг — «Новые брони»: сплошная линия, обычная точка. */
function CircleDot(props: DotItemDotProps) {
  const { cx, cy, stroke } = props

  if (cx == null || cy == null) {
    return null
  }

  return <circle cx={cx} cy={cy} r={4} fill={stroke} stroke="none" />
}

/** Квадрат — «Новые договоры»: штрихпунктирная линия. Форма отличает серию не только цветом. */
function SquareDot(props: DotItemDotProps) {
  const { cx, cy, stroke } = props

  if (cx == null || cy == null) {
    return null
  }

  const half = 3.5

  return (
    <rect
      x={cx - half}
      y={cy - half}
      width={half * 2}
      height={half * 2}
      fill={stroke}
      stroke="none"
    />
  )
}

/** Треугольник — «Оплаченные взносы»: пунктирная линия. */
function TriangleDot(props: DotItemDotProps) {
  const { cx, cy, stroke } = props

  if (cx == null || cy == null) {
    return null
  }

  const r = 4.5

  return (
    <polygon
      points={`${cx},${cy - r} ${cx - r},${cy + r} ${cx + r},${cy + r}`}
      fill={stroke}
      stroke="none"
    />
  )
}

const DOT_BY_KEY: Record<(typeof SERIES)[number]['key'], typeof CircleDot> = {
  newBookings: CircleDot,
  newContracts: SquareDot,
  depositsPaid: TriangleDot,
}

const DASH_BY_KEY: Record<(typeof SERIES)[number]['key'], string | undefined> =
  {
    newBookings: undefined,
    newContracts: '6 4',
    depositsPaid: '2 3',
  }

/**
 * Мини-превью серии в легенде: та же форма точки и штрих линии, что и в
 * самом графике — иначе легенда показывала бы одинаковые круги для всех
 * трёх серий, хотя на графике они различаются формой/пунктиром.
 */
function LegendSwatch({ series }: { series: (typeof SERIES)[number] }) {
  const dash = DASH_BY_KEY[series.key]

  return (
    <svg
      width="22"
      height="12"
      viewBox="0 0 22 12"
      aria-hidden="true"
      className="shrink-0"
    >
      <line
        x1="0"
        y1="6"
        x2="22"
        y2="6"
        stroke={series.color}
        strokeWidth={2}
        strokeDasharray={dash}
      />
      {series.key === 'newBookings' ? (
        <circle cx="11" cy="6" r="3" fill={series.color} />
      ) : series.key === 'newContracts' ? (
        <rect x="8" y="3" width="6" height="6" fill={series.color} />
      ) : (
        <polygon points="11,2.5 7.5,9 14.5,9" fill={series.color} />
      )}
    </svg>
  )
}

function ChartLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
      {SERIES.map((series) => (
        <li
          key={series.key}
          className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400"
        >
          <LegendSwatch series={series} />
          {series.label}
        </li>
      ))}
    </ul>
  )
}

function SalesTooltip({ active, payload, label }: TooltipContentProps) {
  if (
    !active ||
    !payload ||
    payload.length === 0 ||
    typeof label !== 'string'
  ) {
    return null
  }

  return (
    <ChartTooltip label={formatChartFullDate(label)}>
      {SERIES.map((series) => {
        const entry = payload.find((item) => item.dataKey === series.key)
        const value = typeof entry?.value === 'number' ? entry.value : 0

        return (
          <p key={series.key} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block size-2 shrink-0 rounded-full"
              style={{ background: series.color }}
            />
            {series.label}: <span className="font-medium">{value}</span>
          </p>
        )
      })}
    </ChartTooltip>
  )
}

function DataTable({ data }: { data: SalesLinePoint[] }) {
  return (
    <details>
      <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-brand-700 underline underline-offset-4 dark:text-brand-300">
        Показать данные таблицей
      </summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[24rem] text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800">
              <th className="py-1.5 pr-3 font-medium text-muted">Дата</th>
              {SERIES.map((series) => (
                <th
                  key={series.key}
                  className="py-1.5 pr-3 font-medium text-muted"
                >
                  {series.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((point) => (
              <tr
                key={point.date}
                className="border-b border-zinc-100 last:border-0 dark:border-zinc-900"
              >
                <td className="py-1.5 pr-3 whitespace-nowrap tabular-nums">
                  {formatChartFullDate(point.date)}
                </td>
                <td className="py-1.5 pr-3 tabular-nums">
                  {point.newBookings}
                </td>
                <td className="py-1.5 pr-3 tabular-nums">
                  {point.newContracts}
                </td>
                <td className="py-1.5 pr-3 tabular-nums">
                  {point.depositsPaid}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

export function SalesLineChart({
  data,
  isPending,
  isError,
  errorMessage,
  onRetry,
  shown,
  total,
}: {
  data: SalesLinePoint[]
  isPending: boolean
  isError: boolean
  errorMessage?: string
  onRetry: () => void
  shown: number
  total: number
}) {
  const truncated = total > shown

  return (
    <ChartCard
      titleId="chart-sales-line"
      title="Продажи по дням"
      description="Архивные ежедневные отчёты — не текущая сводка."
      isPending={isPending}
      isError={isError}
      errorMessage={errorMessage}
      onRetry={onRetry}
      isEmpty={data.length === 0}
      emptyTitle="За период отчётов по продажам нет"
      plot={
        <div aria-hidden="true" className="h-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid stroke={CHART_GRID_COLOR} vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatChartAxisDate}
                stroke={CHART_AXIS_COLOR}
                fontSize={12}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                stroke={CHART_AXIS_COLOR}
                fontSize={12}
                tickLine={false}
                width={32}
              />
              <Tooltip content={SalesTooltip} isAnimationActive={false} />
              {SERIES.map((series) => (
                <Line
                  key={series.key}
                  dataKey={series.key}
                  name={series.label}
                  stroke={series.color}
                  strokeWidth={2}
                  strokeDasharray={DASH_BY_KEY[series.key]}
                  dot={DOT_BY_KEY[series.key]}
                  activeDot={{ r: 5, strokeWidth: 0, fill: series.color }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      }
      supplementary={
        <div className="space-y-3">
          <ChartLegend />
          {data.length === 1 ? (
            <p className="text-sm text-muted">
              Показан один день: {formatChartFullDate(data[0].date)} — новые
              брони {data[0].newBookings}, новые договоры {data[0].newContracts}
              , взносы {data[0].depositsPaid}.
            </p>
          ) : null}
          {data.length > 0 ? <DataTable data={data} /> : null}
        </div>
      }
      footer={
        <>
          По сформированным ежедневным отчётам. Отсутствующий день не считается
          нулевым.
          {truncated ? (
            <span className="whitespace-nowrap">
              {' '}
              Показаны {shown} из {total} отчётов.
            </span>
          ) : (
            ''
          )}
        </>
      }
    />
  )
}

export default SalesLineChart
