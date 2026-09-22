'use client'

import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { authorizedRequest } from '@/features/auth/session'
import { describeApiError } from '@/features/auth/error-messages'
import {
  ALERT_CLASS,
  FIELD_CLASS,
  LABEL_CLASS,
  SECTION_CLASS,
  SECTION_TITLE_CLASS,
} from '@/features/bookings/components/section'
import { formatTyiynAsSom } from '@/features/contracts/money'

interface PayrollSummary {
  period: string
  employeeCount: number
  draftCount: number
  confirmedCount: number
  totals: {
    baseSalaryTyiyn: string
    fineAmountTyiyn: string
    taxAmountTyiyn: string
    finalAmountTyiyn: string
  }
  missedShiftsTotal: number
  entries: Array<{
    id: string
    employeeFullName: string
    finalAmountTyiyn: string
    missedShiftsCount: number
    status: string
  }>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readMoney(value: unknown): string {
  return typeof value === 'string' ? value : '0'
}

function readSummary(payload: unknown): PayrollSummary | null {
  if (!isRecord(payload) || typeof payload.period !== 'string') {
    return null
  }

  const totals = isRecord(payload.totals) ? payload.totals : {}
  const entries = Array.isArray(payload.entries) ? payload.entries : []

  return {
    period: payload.period,
    employeeCount: typeof payload.employeeCount === 'number' ? payload.employeeCount : 0,
    draftCount: typeof payload.draftCount === 'number' ? payload.draftCount : 0,
    confirmedCount: typeof payload.confirmedCount === 'number' ? payload.confirmedCount : 0,
    totals: {
      baseSalaryTyiyn: readMoney(totals.baseSalaryTyiyn),
      fineAmountTyiyn: readMoney(totals.fineAmountTyiyn),
      taxAmountTyiyn: readMoney(totals.taxAmountTyiyn),
      finalAmountTyiyn: readMoney(totals.finalAmountTyiyn),
    },
    missedShiftsTotal: typeof payload.missedShiftsTotal === 'number' ? payload.missedShiftsTotal : 0,
    entries: entries.filter(isRecord).map((entry) => ({
      id: typeof entry.id === 'string' ? entry.id : '',
      employeeFullName: typeof entry.employeeFullName === 'string' ? entry.employeeFullName : '—',
      finalAmountTyiyn: readMoney(entry.finalAmountTyiyn),
      missedShiftsCount: typeof entry.missedShiftsCount === 'number' ? entry.missedShiftsCount : 0,
      status: typeof entry.status === 'string' ? entry.status : 'draft',
    })),
  }
}

/** Текущий месяц в формате API: `YYYY-MM`. */
function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7)
}

/**
 * Зарплата в отчётности. Решение владельца 22.09.2026: этот блок видит
 * только директор, поэтому и маршрут `GET /payroll/summary` на сервере
 * строго директорский — фронт лишь не показывает лишнего.
 */
export default function PayrollSummarySection() {
  const [period, setPeriod] = useState(currentPeriod())

  const query = useQuery({
    queryKey: ['payroll-summary', period],
    queryFn: async () =>
      readSummary(await authorizedRequest<unknown>(`/payroll/summary?period=${period}`)),
    retry: false,
  })

  const summary = query.data ?? null

  return (
    <section className={SECTION_CLASS}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className={SECTION_TITLE_CLASS}>Зарплата за месяц</h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Фонд оплаты труда, удержания и прогулы. Видит только директор.
          </p>
        </div>

        <div>
          <label className={LABEL_CLASS} htmlFor="payroll-summary-period">
            Месяц
          </label>
          <input
            id="payroll-summary-period"
            type="month"
            className={`${FIELD_CLASS} mt-1`}
            value={period}
            max={currentPeriod()}
            onChange={(event) => {
              if (event.target.value !== '') {
                setPeriod(event.target.value)
              }
            }}
          />
        </div>
      </div>

      {query.isError ? (
        <p className={`${ALERT_CLASS} mt-4`} role="alert">
          {describeApiError(query.error)}
        </p>
      ) : query.isPending ? (
        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">Загружаем…</p>
      ) : !summary || summary.employeeCount === 0 ? (
        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
          За этот месяц начислений ещё нет — их формирует бухгалтер.
        </p>
      ) : (
        <>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['К выплате', formatTyiynAsSom(summary.totals.finalAmountTyiyn)],
              ['Оклады', formatTyiynAsSom(summary.totals.baseSalaryTyiyn)],
              ['Штрафы', formatTyiynAsSom(summary.totals.fineAmountTyiyn)],
              ['Налог', formatTyiynAsSom(summary.totals.taxAmountTyiyn)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-control bg-surface-muted p-3">
                <dt className="text-caption text-zinc-500 dark:text-zinc-400">{label}</dt>
                <dd className="mt-1 text-lg font-semibold text-zinc-900 tabular-nums dark:text-zinc-50">
                  {value}
                </dd>
              </div>
            ))}
          </dl>

          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
            Сотрудников: {summary.employeeCount} · подтверждено {summary.confirmedCount} ·
            черновиков {summary.draftCount} · прогулов {summary.missedShiftsTotal}
          </p>

          <div className="mt-4 -mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[28rem] border-collapse text-sm">
              <thead>
                <tr className="text-left text-caption text-zinc-500 dark:text-zinc-400">
                  <th className="py-2 pr-4 font-medium">Сотрудник</th>
                  <th className="py-2 pr-4 font-medium">Прогулов</th>
                  <th className="py-2 pr-4 font-medium">К выплате</th>
                  <th className="py-2 font-medium">Статус</th>
                </tr>
              </thead>
              <tbody>
                {summary.entries.map((entry) => (
                  <tr key={entry.id} className="border-t border-zinc-200 dark:border-zinc-800">
                    <td className="py-2 pr-4">{entry.employeeFullName}</td>
                    <td className="py-2 pr-4 tabular-nums">{entry.missedShiftsCount}</td>
                    <td className="py-2 pr-4 tabular-nums">{formatTyiynAsSom(entry.finalAmountTyiyn)}</td>
                    <td className="py-2">
                      {entry.status === 'confirmed' ? 'Подтверждено' : 'Черновик'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
