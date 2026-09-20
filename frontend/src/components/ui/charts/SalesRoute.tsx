import {
  ArrowRightIcon,
  CalendarCheckIcon,
  FileTextIcon,
  HandCoinsIcon,
  SealCheckIcon,
} from '@phosphor-icons/react/dist/ssr'
import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * «Маршрут продаж» как единая диаграмма процесса (не ряд отдельных
 * карточек): четыре узла на общей брендированной панели — `/dashboard`
 * отдаёт агрегаты статусов за период, а не когорту одной группы сделок,
 * поэтому убывающая ширина или процент конверсии между узлами были бы
 * аналитически неверны. `href` — только для тех разделов, куда у роли есть
 * доступ; без него узел — не кликабельный, не фиктивная ссылка.
 */
export interface SalesRouteNode {
  key: string
  label: string
  href?: string
  count: number
  metricLabel: string
  metricValue: string
}

const STATION_ICONS = [
  CalendarCheckIcon,
  FileTextIcon,
  HandCoinsIcon,
  SealCheckIcon,
]

function StationMarker({ Icon }: { Icon: (typeof STATION_ICONS)[number] }) {
  return (
    <span
      aria-hidden="true"
      className="z-10 flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-warm text-on-accent-warm shadow-sm motion-safe:animate-[route-node-in_200ms_ease-out_both]"
    >
      <Icon size={20} weight="bold" />
    </span>
  )
}

function StationContent({ node }: { node: SalesRouteNode }) {
  return (
    <div className="min-w-0">
      <p className="text-caption font-semibold uppercase tracking-wide text-muted">
        {node.label}
      </p>
      <p className="text-xl font-bold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
        {node.count}
      </p>
      <p className="whitespace-nowrap text-sm text-muted">
        {node.metricLabel}:{' '}
        <span className="tabular-nums">{node.metricValue}</span>
      </p>
    </div>
  )
}

function Station({
  node,
  Icon,
}: {
  node: SalesRouteNode
  Icon: (typeof STATION_ICONS)[number]
}) {
  const inner = (
    <>
      <StationMarker Icon={Icon} />
      <StationContent node={node} />
    </>
  )

  const sharedClass =
    'flex min-h-11 min-w-0 flex-1 items-start gap-3 rounded-control p-1.5 text-left xl:flex-col xl:items-center xl:gap-2 xl:p-2 xl:text-center'

  if (node.href) {
    return (
      <Link
        href={node.href}
        className={`${sharedClass} transition-colors hover:bg-brand-100 focus-visible:bg-brand-100 dark:hover:bg-white/5 dark:focus-visible:bg-white/5`}
      >
        {inner}
      </Link>
    )
  }

  return <div className={sharedClass}>{inner}</div>
}

/**
 * Тонкая соединительная линия между станциями — вертикальная на
 * mobile/tablet, горизонтальная от `xl`. Смещение считает центр маркера от
 * края станции: `p-1.5` (6px) + половина `size-11` (22px) = 28px на mobile;
 * `xl:p-2` (8px) + 22px = 30px на desktop.
 */
function Connector() {
  return (
    <div
      aria-hidden="true"
      className="ml-[28px] h-6 w-0.5 shrink-0 bg-brand-300 xl:ml-0 xl:mt-[30px] xl:h-0.5 xl:w-auto xl:flex-1 dark:bg-brand-800"
    />
  )
}

function Segment({
  isFirst,
  children,
}: {
  isFirst: boolean
  children: ReactNode
}) {
  return (
    <>
      {isFirst ? null : <Connector />}
      {children}
    </>
  )
}

export function SalesRoute({ stages }: { stages: SalesRouteNode[] }) {
  return (
    <div className="rounded-card border border-brand-200 bg-brand-50 p-5 dark:border-brand-900 dark:bg-brand-950">
      <div className="flex flex-col xl:flex-row xl:items-start">
        {stages.map((stage, index) => (
          <Segment key={stage.key} isFirst={index === 0}>
            <Station
              node={stage}
              Icon={STATION_ICONS[index] ?? CalendarCheckIcon}
            />
          </Segment>
        ))}

        <div
          aria-hidden="true"
          className="hidden shrink-0 items-center pl-2 xl:mt-[30px] xl:flex"
        >
          <ArrowRightIcon
            size={16}
            className="text-brand-400 dark:text-brand-700"
          />
        </div>
      </div>
    </div>
  )
}

export default SalesRoute
