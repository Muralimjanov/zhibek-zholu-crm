import { useQuery } from '@tanstack/react-query';
import { AlertCircle, ArrowDownRight, ArrowUpRight, BookMarked, FileSignature, HandCoins, Scale, UserX, Wallet } from 'lucide-react';
import * as React from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { dashboardApi } from '@/api/endpoints';
import { ErrorState, Money, PageHeader, StatCard } from '@/components/app';
import { DateRange } from '@/components/DateRange';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/misc';
import { monthStartIso, todayIso } from '@/lib/dates';
import { BOOKING_STATUS, CATEGORY_LABELS, CONTRACT_STATUS } from '@/lib/labels';
import { formatArea, formatSom, tyiynToNumber } from '@/lib/money';

const tooltipStyle = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--foreground)' };

export default function DashboardPage() {
  const [range, setRange] = React.useState({ from: monthStartIso(), to: todayIso() });
  const q = useQuery({ queryKey: ['dashboard', range], queryFn: () => dashboardApi.summary(range.from, range.to) });
  const d = q.data;

  const expenses = (d?.accounting.byCategory ?? [])
    .filter((c) => c.type === 'expense' && c.amountTyiyn !== '0')
    .map((c) => ({ name: CATEGORY_LABELS[c.category], value: tyiynToNumber(c.amountTyiyn), raw: c.amountTyiyn }))
    .sort((a, b) => b.value - a.value);
  const contracts = (d?.contracts ?? []).map((c) => ({ name: CONTRACT_STATUS[c.status].label, count: c.count, area: Number(c.areaSqm) }));
  const net = d?.accounting.netTyiyn ?? '0';

  return (
    <>
      <PageHeader
        title="Сводка"
        description="Продажи, финансы и посещаемость компании за период. Персональные данные покупателей здесь не показываются."
        actions={<DateRange from={range.from} to={range.to} max={todayIso()} onChange={(from, to) => setRange({ from, to })} />}
      />
      {q.isError ? (
        <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card>
      ) : (
        <div className="space-y-4">
          <section aria-label="Финансы" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Приходы" icon={ArrowUpRight} tone="success" loading={q.isLoading} value={formatSom(d?.accounting.incomeTyiyn)} />
            <StatCard label="Расходы" icon={ArrowDownRight} tone="danger" loading={q.isLoading} value={formatSom(d?.accounting.expenseTyiyn)} />
            <StatCard
              label="Чистый результат"
              icon={Scale}
              tone={net.startsWith('-') ? 'danger' : 'primary'}
              loading={q.isLoading}
              value={<span className={net.startsWith('-') ? 'text-destructive' : ''}>{formatSom(net)}</span>}
              hint={net.startsWith('-') ? 'Расходы превышают приходы' : undefined}
            />
            <StatCard label="Внесено взносов" icon={HandCoins} tone="info" loading={q.isLoading} value={formatSom(d?.depositsPaid.amountTyiyn)} hint={d ? `${d.depositsPaid.count} договор(ов)` : undefined} />
          </section>

          <section aria-label="Продажи и персонал" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Новые брони"
              icon={BookMarked}
              loading={q.isLoading}
              value={d?.bookings.reduce((a, b) => a + b.count, 0) ?? 0}
              hint={d ? `Активных: ${d.bookings.find((b) => b.status === 'active')?.count ?? 0} · ${formatArea(d.bookings.find((b) => b.status === 'active')?.areaSqm)}` : undefined}
            />
            <StatCard
              label="Подписано договоров"
              icon={FileSignature}
              tone="success"
              loading={q.isLoading}
              value={d?.contracts.find((c) => c.status === 'signed')?.count ?? 0}
              hint={d ? `${formatArea(d.contracts.find((c) => c.status === 'signed')?.areaSqm)} · ${formatSom(d.contracts.find((c) => c.status === 'signed')?.totalAmountTyiyn)}` : undefined}
            />
            <StatCard label="Зарплата (подтверждено)" icon={Wallet} tone="warning" loading={q.isLoading} value={formatSom(d?.payrollConfirmed.finalAmountTyiyn)} hint={d ? `Налог ${formatSom(d.payrollConfirmed.taxAmountTyiyn)} · штрафы ${formatSom(d.payrollConfirmed.fineAmountTyiyn)}` : undefined} />
            <StatCard label="Прогулы" icon={UserX} tone={d && d.attendance.missedShifts > 0 ? 'danger' : 'primary'} loading={q.isLoading} value={d?.attendance.missedShifts ?? 0} hint="Смены, не открытые без выходного" />
          </section>

          <div className="grid gap-4 xl:grid-cols-5">
            <Card className="xl:col-span-3">
              <CardHeader>
                <div>
                  <CardTitle>Расходы по категориям</CardTitle>
                  <CardDescription>Сом, за выбранный период</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {q.isLoading ? (
                  <Skeleton className="h-72" />
                ) : expenses.length === 0 ? (
                  <p className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground"><AlertCircle className="size-4" aria-hidden />Расходов за период нет</p>
                ) : (
                  <div className="h-[max(18rem,calc(var(--rows)*2.25rem))]" style={{ ['--rows' as string]: expenses.length }} role="img" aria-label={`Расходы по категориям: ${expenses.map((e) => `${e.name} ${formatSom(e.raw)}`).join('; ')}`}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={expenses} layout="vertical" margin={{ left: 8, right: 16 }}>
                        <CartesianGrid horizontal={false} stroke="var(--border)" />
                        <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickFormatter={(v: number) => v.toLocaleString('ru-RU', { notation: 'compact' })} />
                        <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 12, fill: 'var(--foreground)' }} />
                        <Tooltip cursor={{ fill: 'var(--muted)' }} contentStyle={tooltipStyle} formatter={(_v, _n, item) => [formatSom((item.payload as { raw: string }).raw), 'Сумма']} />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]} fill="var(--chart-3)" maxBarSize={22} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="xl:col-span-2">
              <CardHeader>
                <div>
                  <CardTitle>Договоры по статусам</CardTitle>
                  <CardDescription>Созданные за период</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {q.isLoading ? (
                  <Skeleton className="h-56" />
                ) : (
                  <>
                    <div className="h-48" role="img" aria-label={contracts.map((c) => `${c.name}: ${c.count}`).join(', ')}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={contracts}>
                          <CartesianGrid vertical={false} stroke="var(--border)" />
                          <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} width={28} />
                          <Tooltip cursor={{ fill: 'var(--muted)' }} contentStyle={tooltipStyle} formatter={(v) => [v, 'Договоров']} />
                          <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={48}>
                            {contracts.map((_, i) => <Cell key={i} fill={['var(--chart-2)', 'var(--chart-3)', 'var(--chart-1)'][i]} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <dl className="mt-3 divide-y text-sm">
                      {d?.contracts.map((c) => (
                        <div key={c.status} className="flex items-center justify-between py-2">
                          <dt className="text-muted-foreground">{CONTRACT_STATUS[c.status].label}</dt>
                          <dd className="tabular font-medium">{c.count} · {formatArea(c.areaSqm)} · <Money tyiyn={c.totalAmountTyiyn} /></dd>
                        </div>
                      ))}
                      {d?.bookings.map((b) => (
                        <div key={b.status} className="flex items-center justify-between py-2">
                          <dt className="text-muted-foreground">Брони: {BOOKING_STATUS[b.status].label.toLowerCase()}</dt>
                          <dd className="tabular font-medium">{b.count} · {formatArea(b.areaSqm)}</dd>
                        </div>
                      ))}
                    </dl>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
