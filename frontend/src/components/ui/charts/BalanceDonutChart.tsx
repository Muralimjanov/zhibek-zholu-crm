'use client'

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import ChartCard from './ChartCard'
import ChartTooltip from './ChartTooltip'

interface DonutSegment {
  key: string
  label: string
  value: number
  displayValue: string
  color: string
}

/**
 * «Приход и расход» — donut, не заполненный pie (`innerRadius` > 0):
 * сумма в центре — уже приходит от сервера (`netTyiyn`), не пересчитывается
 * из сегментов. Кольцо — единственное, что живёт в области фиксированной
 * высоты (`plot`); легенда с точными суммами и exact-подпись итога идут
 * ниже обычным потоком, поэтому длинный `netLabel` не пересекается с
 * кольцом и не обрезается.
 */
export function BalanceDonutChart({
  netLabel,
  netCompactLabel,
  incomeApprox,
  expenseApprox,
  incomeDisplay,
  expenseDisplay,
}: {
  netLabel: string
  netCompactLabel?: string
  incomeApprox: number
  expenseApprox: number
  incomeDisplay: string
  expenseDisplay: string
}) {
  const bothZero = incomeApprox <= 0 && expenseApprox <= 0
  const centerLabel = netCompactLabel ?? netLabel

  const segments: DonutSegment[] = bothZero
    ? [
        {
          key: 'empty',
          label: 'Нет операций',
          value: 1,
          displayValue: '—',
          color: 'var(--chart-axis)',
        },
      ]
    : [
        {
          key: 'income',
          label: 'Приход',
          value: Math.max(incomeApprox, 0),
          displayValue: incomeDisplay,
          color: 'var(--chart-success)',
        },
        {
          key: 'expense',
          label: 'Расход',
          value: Math.max(expenseApprox, 0),
          displayValue: expenseDisplay,
          color: 'var(--chart-danger)',
        },
      ]

  return (
    <ChartCard
      titleId="chart-balance-donut"
      title="Приход и расход"
      description="Текущая сводка за период — обновляется сразу."
      isPending={false}
      isError={false}
      isEmpty={false}
      heightClassName="h-[260px] sm:h-[300px]"
      plot={
        <div className="relative mx-auto aspect-square h-full max-h-full">
          <div aria-hidden="true" className="h-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={segments}
                  dataKey="value"
                  nameKey="label"
                  innerRadius="65%"
                  outerRadius="100%"
                  startAngle={90}
                  endAngle={-270}
                  stroke="none"
                  isAnimationActive={false}
                >
                  {segments.map((segment) => (
                    <Cell key={segment.key} fill={segment.color} />
                  ))}
                </Pie>
                {bothZero ? null : (
                  <Tooltip
                    isAnimationActive={false}
                    content={({ active, payload }) => {
                      if (!active || !payload || payload.length === 0) {
                        return null
                      }

                      const point = payload[0]
                      const segment = segments.find(
                        (item) => item.label === point.name,
                      )

                      return (
                        <ChartTooltip>
                          <p>
                            {point.name}:{' '}
                            <span className="font-medium">
                              {segment?.displayValue}
                            </span>
                          </p>
                        </ChartTooltip>
                      )
                    }}
                  />
                )}
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
            <p className="text-caption text-muted">Итог</p>
            <p className="whitespace-nowrap text-lg font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
              {centerLabel}
            </p>
          </div>
        </div>
      }
      supplementary={
        <div className="space-y-3">
          {netCompactLabel ? (
            <p className="text-sm text-muted">
              Точный итог:{' '}
              <span className="whitespace-nowrap font-medium tabular-nums text-zinc-900 dark:text-zinc-50">
                {netLabel}
              </span>
            </p>
          ) : null}

          <ul className="space-y-2 text-sm">
            {bothZero ? (
              <li className="text-muted">Операций за период нет.</li>
            ) : (
              segments.map((segment) => (
                <li
                  key={segment.key}
                  className="grid min-w-0 gap-x-3 gap-y-0.5 sm:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <span className="flex min-w-0 items-center gap-2 text-zinc-600 dark:text-zinc-400">
                    <span
                      aria-hidden="true"
                      className="inline-block size-2.5 shrink-0 rounded-full"
                      style={{ background: segment.color }}
                    />
                    <span className="min-w-0 truncate">{segment.label}</span>
                  </span>
                  <span className="whitespace-nowrap font-medium tabular-nums text-zinc-900 dark:text-zinc-50">
                    {segment.displayValue}
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>
      }
    />
  )
}

export default BalanceDonutChart
