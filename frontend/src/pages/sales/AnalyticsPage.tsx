import { useQuery } from '@tanstack/react-query';
import { Banknote, Ruler, SquareDashed } from 'lucide-react';
import * as React from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { dashboardApi } from '@/api/endpoints';
import { EmptyState, ErrorState, Money, PageHeader, StatCard, TableSkeleton } from '@/components/app';
import { DateRange } from '@/components/DateRange';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { monthStartIso, todayIso } from '@/lib/dates';
import { ROLE_LABELS } from '@/lib/labels';
import { formatArea, formatSom } from '@/lib/money';

const tooltipStyle = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--foreground)' };

export default function AnalyticsPage() {
  const [range, setRange] = React.useState({ from: monthStartIso(), to: todayIso() });
  const q = useQuery({ queryKey: ['analytics', range], queryFn: () => dashboardApi.sales(range.from, range.to) });
  const d = q.data;
  const chart = (d?.perManager ?? []).map((m) => ({ name: m.fullName.split(' ').slice(0, 2).join(' '), booked: Number(m.bookings.areaSqm), sold: Number(m.signedContracts.areaSqm) }));

  return (
    <>
      <PageHeader title="Аналитика продаж" description="Забронированные и проданные м², посещаемость команды." actions={<DateRange from={range.from} to={range.to} max={todayIso()} onChange={(from, to) => setRange({ from, to })} />} />
      {q.isError ? <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card> : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Забронировано" icon={SquareDashed} tone="info" loading={q.isLoading} value={formatArea(d?.totals.bookedAreaSqm)} />
            <StatCard label="Продано (подписано)" icon={Ruler} tone="success" loading={q.isLoading} value={formatArea(d?.totals.soldAreaSqm)} />
            <StatCard label="Сумма подписанных договоров" icon={Banknote} loading={q.isLoading} value={formatSom(d?.totals.soldAmountTyiyn)} />
          </div>
          <Card>
            <CardHeader><div><CardTitle>м² по менеджерам</CardTitle><CardDescription>Брони и подписанные договоры за период</CardDescription></div></CardHeader>
            <CardContent>
              {q.isLoading ? <div className="h-64 animate-pulse rounded-md bg-muted" /> : chart.length === 0 ? <EmptyState title="Нет данных" /> : (
                <div className="h-72" role="img" aria-label={chart.map((c) => `${c.name}: забронировано ${c.booked} м², продано ${c.sold} м²`).join('; ')}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chart}>
                      <CartesianGrid vertical={false} stroke="var(--border)" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} interval={0} />
                      <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} width={44} />
                      <Tooltip cursor={{ fill: 'var(--muted)' }} contentStyle={tooltipStyle} formatter={(v, n) => [`${Number(v).toLocaleString('ru-RU')} м²`, n]} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar name="Забронировано" dataKey="booked" fill="var(--chart-2)" radius={[4, 4, 0, 0]} maxBarSize={36} />
                      <Bar name="Продано" dataKey="sold" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={36} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Команда</CardTitle></CardHeader>
            {q.isLoading ? <TableSkeleton cols={7} /> : (
              <Table>
                <THead>
                  <TR><TH>Сотрудник</TH><TH className="text-right">Брони</TH><TH className="text-right">Подписано</TH><TH className="text-right">Сумма</TH><TH className="text-right">Смен</TH><TH className="text-right">Прогулов</TH><TH className="text-right">Выходных</TH></TR>
                </THead>
                <TBody>
                  {d?.perManager.map((m) => (
                    <TR key={m.userId}>
                      <TD><p className="font-medium">{m.fullName}</p><p className="text-xs text-muted-foreground">{ROLE_LABELS[m.role]}</p></TD>
                      <TD className="tabular text-right">{m.bookings.count} · {formatArea(m.bookings.areaSqm)}</TD>
                      <TD className="tabular text-right">{m.signedContracts.count} · {formatArea(m.signedContracts.areaSqm)}</TD>
                      <TD className="text-right"><Money tyiyn={m.signedContracts.totalAmountTyiyn} /></TD>
                      <TD className="tabular text-right">{m.attendance.workedShifts}</TD>
                      <TD className={`tabular text-right ${m.attendance.missedShifts > 0 ? 'font-semibold text-destructive' : ''}`}>{m.attendance.missedShifts}</TD>
                      <TD className="tabular text-right">{m.attendance.dayOffs}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
