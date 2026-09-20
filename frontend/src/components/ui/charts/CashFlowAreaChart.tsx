'use client'

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts'
import { formatSignedTyiynAsSom } from '@/features/contracts/money'
import type { CashFlowPoint } from '@/features/reports/dashboardCharts'
import {
  formatChartAxisDate,
  formatChartFullDate,
} from '@/features/reports/dashboardCharts'
import ChartCard from './ChartCard'
import { CHART_AXIS_COLOR, CHART_GRID_COLOR } from './chartTheme'
import ChartTooltip from './ChartTooltip'

/**
 * Компактная подпись деления оси Y — только для геометрии/делений, не для
 * авторитетной суммы (та строится из исходной строки в tooltip/таблице).
 * Отдельное имя (не `formatCompactSom`) — та функция в `dashboardCharts.ts`
 * работает со строкой тыйынов через `BigInt` и имеет свой порог в 1000 сом;
 * эта берёт уже приближённое число и всегда что-то печатает, без порога.
 */
function formatAxisTickSom(value: number): string {
  const abs = Math.abs(value)

  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1).replace('.', ',')} млн`
  }

  if (abs >= 1_000) {
    return `${(value / 1_000).toFixed(1).replace('.', ',')} тыс`
  }

  return `${Math.round(value)}`
}

function CashFlowTooltip({ active, payload, label }: TooltipContentProps) {
  if (
    !active ||
    !payload ||
    payload.length === 0 ||
    typeof label !== 'string'
  ) {
    return null
  }

  const point = payload[0]?.payload as CashFlowPoint | undefined

  if (!point) {
    return null
  }

  return (
    <ChartTooltip label={formatChartFullDate(label)}>
      <p className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="inline-block size-2 shrink-0 rounded-full"
          style={{ background: 'var(--chart-success)' }}
        />
        Приход:{' '}
        <span className="font-medium">
          {formatSignedTyiynAsSom(point.incomeTyiyn)}
        </span>
      </p>
      <p className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="inline-block size-2 shrink-0 rounded-full"
          style={{ background: 'var(--chart-danger)' }}
        />
        Расход:{' '}
        <span className="font-medium">
          {formatSignedTyiynAsSom(point.expenseTyiyn)}
        </span>
      </p>
    </ChartTooltip>
  )
}

export function CashFlowAreaChart({
  data,
  isPending,
  isError,
  errorMessage,
  onRetry,
  shown,
  total,
}: {
  data: CashFlowPoint[]
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
      titleId="chart-cash-flow-area"
      title="Денежный поток по дням"
      description="Архивные ежедневные отчёты — не текущая сводка."
      isPending={isPending}
      isError={isError}
      errorMessage={errorMessage}
      onRetry={onRetry}
      isEmpty={data.length === 0}
      emptyTitle="За период финансовых отчётов нет"
      plot={
        <div aria-hidden="true" className="h-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
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
                tickFormatter={formatAxisTickSom}
                stroke={CHART_AXIS_COLOR}
                fontSize={12}
                tickLine={false}
                width={40}
              />
              <Tooltip content={CashFlowTooltip} isAnimationActive={false} />
              <Area
                dataKey="incomeApprox"
                name="Приход"
                stroke="var(--chart-success)"
                fill="var(--chart-success)"
                fillOpacity={0.25}
                strokeWidth={2}
                dot={data.length === 1}
                isAnimationActive={false}
              />
              <Area
                dataKey="expenseApprox"
                name="Расход"
                stroke="var(--chart-danger)"
                fill="var(--chart-danger)"
                fillOpacity={0.25}
                strokeWidth={2}
                dot={data.length === 1}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      }
      supplementary={
        <div className="space-y-3">
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
            <li className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
              <span
                aria-hidden="true"
                className="inline-block size-2 shrink-0 rounded-full"
                style={{ background: 'var(--chart-success)' }}
              />
              Приход
            </li>
            <li className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
              <span
                aria-hidden="true"
                className="inline-block size-2 shrink-0 rounded-full"
                style={{ background: 'var(--chart-danger)' }}
              />
              Расход
            </li>
          </ul>

          {data.length === 1 ? (
            <p className="text-sm text-muted">
              Показан один день: {formatChartFullDate(data[0].date)} — приход{' '}
              <span className="whitespace-nowrap">
                {formatSignedTyiynAsSom(data[0].incomeTyiyn)}
              </span>
              , расход{' '}
              <span className="whitespace-nowrap">
                {formatSignedTyiynAsSom(data[0].expenseTyiyn)}
              </span>
              .
            </p>
          ) : null}

          {data.length > 0 ? (
            <details>
              <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-brand-700 underline underline-offset-4 dark:text-brand-300">
                Показать данные таблицей
              </summary>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[24rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800">
                      <th className="py-1.5 pr-3 font-medium text-muted">
                        Дата
                      </th>
                      <th className="py-1.5 pr-3 font-medium text-muted">
                        Приход
                      </th>
                      <th className="py-1.5 pr-3 font-medium text-muted">
                        Расход
                      </th>
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
                        <td className="py-1.5 pr-3 whitespace-nowrap tabular-nums">
                          {formatSignedTyiynAsSom(point.incomeTyiyn)}
                        </td>
                        <td className="py-1.5 pr-3 whitespace-nowrap tabular-nums">
                          {formatSignedTyiynAsSom(point.expenseTyiyn)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ) : null}
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

export default CashFlowAreaChart
