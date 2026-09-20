'use client'

import { useId, useState } from 'react'
import {
  Bar,
  BarChart as RechartsBarChart,
  Cell,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts'
import type { BarChartItem } from './BarChart'
import ChartCard from './ChartCard'
import {
  CHART_AXIS_COLOR,
  CHART_GRID_COLOR,
  toneChartColor,
} from './chartTheme'
import ChartTooltip from './ChartTooltip'

type Tab = 'bookings' | 'contracts'

/** Короткие подписи для оси X — полные названия статусов остаются в видимой легенде под графиком, чтобы не накладывались друг на друга. */
const SHORT_AXIS_LABEL: Record<string, string> = {
  active: 'Активные',
  converted: 'В договор',
  cancelled: 'Отменено',
  draft: 'Черновик',
  deposit_paid: 'Взнос',
  signed: 'Подписан',
}

function shortAxisLabel(key: string): string {
  return SHORT_AXIS_LABEL[key] ?? key
}

function StatusTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) {
    return null
  }

  const point = payload[0]?.payload as BarChartItem | undefined

  if (!point) {
    return null
  }

  return (
    <ChartTooltip label={point.label}>
      <p className="font-medium">{point.displayValue}</p>
    </ChartTooltip>
  )
}

/**
 * «Статусы сделок» — вертикальные столбцы, вкладка переключает уже
 * загруженные `bookingsItems`/`contractsItems` (та же сводка `/dashboard`),
 * без повторного сетевого запроса. Легенда под графиком дублирует точное
 * значение текстом — цвет не единственный носитель смысла.
 */
export function StatusBarChart({
  bookingsItems,
  contractsItems,
}: {
  bookingsItems: BarChartItem[]
  contractsItems: BarChartItem[]
}) {
  const [tab, setTab] = useState<Tab>('bookings')
  const groupName = useId()
  const items = tab === 'bookings' ? bookingsItems : contractsItems

  const segmentedControl = (
    <div role="radiogroup" aria-label="Раздел" className="inline-flex gap-1.5">
      {(
        [
          { value: 'bookings' as const, label: 'Бронирования' },
          { value: 'contracts' as const, label: 'Договоры' },
        ] as const
      ).map((option) => {
        const checked = tab === option.value

        return (
          <label key={option.value} className="cursor-pointer">
            <input
              type="radio"
              name={groupName}
              value={option.value}
              checked={checked}
              onChange={() => {
                setTab(option.value)
              }}
              className="peer sr-only"
            />
            <span
              className={`flex min-h-11 items-center rounded-control border px-3 text-sm font-medium transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-600 ${
                checked
                  ? 'border-brand-600 bg-brand-600 text-on-brand'
                  : 'border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800'
              }`}
            >
              {option.label}
            </span>
          </label>
        )
      })}
    </div>
  )

  return (
    <ChartCard
      titleId="chart-status-bar"
      title="Статусы сделок"
      description="Текущая сводка за период — обновляется сразу."
      action={segmentedControl}
      isPending={false}
      isError={false}
      isEmpty={items.length === 0}
      emptyTitle={
        tab === 'bookings' ? 'Броней за период нет' : 'Договоров за период нет'
      }
      plot={
        <div aria-hidden="true" className="h-full">
          <ResponsiveContainer width="100%" height="100%">
            <RechartsBarChart
              data={items}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid stroke={CHART_GRID_COLOR} vertical={false} />
              <XAxis
                dataKey="key"
                tickFormatter={shortAxisLabel}
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
              <Tooltip content={StatusTooltip} isAnimationActive={false} />
              <Bar
                dataKey="value"
                isAnimationActive={false}
                radius={[4, 4, 0, 0]}
              >
                {items.map((item) => (
                  <Cell
                    key={item.key}
                    fill={toneChartColor(item.tone ?? 'neutral')}
                  />
                ))}
              </Bar>
            </RechartsBarChart>
          </ResponsiveContainer>
        </div>
      }
      supplementary={
        <ul className="space-y-2 text-sm">
          {items.map((item) => (
            <li
              key={item.key}
              className="grid min-w-0 gap-x-3 gap-y-0.5 sm:grid-cols-[minmax(0,1fr)_auto]"
            >
              <span className="flex min-w-0 items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
                <span
                  aria-hidden="true"
                  className={`inline-block size-2 shrink-0 rounded-full ${item.barClassName}`}
                />
                <span className="min-w-0 truncate">{item.label}</span>
              </span>
              <span className="whitespace-nowrap font-medium tabular-nums text-zinc-900 dark:text-zinc-50">
                {item.displayValue}
              </span>
            </li>
          ))}
        </ul>
      }
    />
  )
}

export default StatusBarChart
