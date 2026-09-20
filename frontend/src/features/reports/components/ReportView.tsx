import {
  formatSignedTyiynAsSom,
  formatTyiynAsSom,
} from '@/features/contracts/money'
import { formatGeneratedAt } from '../labels'
import type { DailyReport, FinancialData, SalesData } from '../parse'

const row =
  'flex justify-between gap-4 border-b border-zinc-100 py-2 text-sm dark:border-zinc-800'
const label = (type: string) => (type === 'sales' ? 'Продажи' : 'Финансы')
export function reportTypeLabel(type: string) {
  return label(type)
}
export function Metric({
  name,
  value,
}: {
  name: string
  value: string | number
}) {
  return (
    <div className={row}>
      <dt className="text-zinc-600 dark:text-zinc-400">{name}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  )
}
export function CategoryBreakdown({
  categories,
}: {
  categories: FinancialData['byCategory']
}) {
  return (
    <div className="mt-4">
      <h4 className="font-medium">По категориям</h4>
      {categories.filter((x) => x.count > 0).length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500">Операций нет.</p>
      ) : (
        <dl>
          {categories
            .filter((x) => x.count > 0)
            .map((x) => (
              <Metric
                key={x.category}
                name={`${x.label} · ${x.count}`}
                value={formatTyiynAsSom(x.amountTyiyn)}
              />
            ))}
        </dl>
      )}
    </div>
  )
}
export function ReportView({ report }: { report: DailyReport }) {
  const data = report.data
  return (
    <article className="space-y-5 text-zinc-900 dark:text-zinc-50">
      <div>
        <p className="text-xs text-zinc-500">
          Сформирован: {formatGeneratedAt(report.generatedAt)}
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Это данные на момент последнего формирования. Новые брони, договоры и
          операции видны в текущей сводке; при повторном закрытии смены за тот
          же день сервер обновит отчёт.
        </p>
      </div>
      <p className="whitespace-pre-line text-sm leading-6">{report.summary}</p>
      {report.type === 'financial' ? (
        <FinancialView data={data as FinancialData} />
      ) : (
        <SalesView data={data as SalesData} />
      )}
    </article>
  )
}
function FinancialView({ data }: { data: FinancialData }) {
  return (
    <>
      <dl>
        <Metric name="Приход" value={formatTyiynAsSom(data.incomeTyiyn)} />
        <Metric name="Расход" value={formatTyiynAsSom(data.expenseTyiyn)} />
        <Metric name="Итог" value={formatSignedTyiynAsSom(data.netTyiyn)} />
      </dl>
      <CategoryBreakdown categories={data.byCategory} />
    </>
  )
}
function SalesView({ data }: { data: SalesData }) {
  return (
    <dl>
      <Metric
        name="Новые бронирования"
        value={`${data.newBookings.count} · ${data.newBookings.areaSqm} м²`}
      />
      <Metric
        name="Новые договоры"
        value={`${data.newContracts.count} · ${data.newContracts.areaSqm} м² · ${formatTyiynAsSom(data.newContracts.totalAmountTyiyn)}`}
      />
      <Metric
        name="Оплаченные взносы"
        value={`${data.depositsPaid.count} · ${formatTyiynAsSom(data.depositsPaid.amountTyiyn)}`}
      />
      <Metric name="Сотрудников в команде" value={data.attendance.teamSize} />
      <Metric name="Открыли смену" value={data.attendance.opened} />
      <Metric name="На выходном" value={data.attendance.onDayOff} />
      <Metric
        name="Не открыли смену"
        value={data.attendance.notOpened.length}
      />
      {data.attendance.notOpened.length > 0 ? (
        <div className="py-2">
          <dt className="text-sm text-zinc-600 dark:text-zinc-400">
            Кто не открыл смену
          </dt>
          <dd className="mt-1 text-sm">
            <ul className="list-inside list-disc">
              {data.attendance.notOpened.map((employee) => (
                <li key={employee.userId}>{employee.fullName}</li>
              ))}
            </ul>
          </dd>
        </div>
      ) : null}
    </dl>
  )
}
