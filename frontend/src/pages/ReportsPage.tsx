import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChartNoAxesColumn, Landmark, RefreshCw } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { reportsApi } from '@/api/endpoints';
import type { DailyReportType } from '@/api/types';
import { useUser } from '@/auth/AuthProvider';
import { EmptyState, ErrorState, PageHeader, Pagination } from '@/components/app';
import { DateRange } from '@/components/DateRange';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { NativeSelect, Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Skeleton, Tabs, TabsList, TabsTrigger } from '@/components/ui/misc';
import { formatDate, formatDateTime, todayIso } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import { REPORT_TYPE } from '@/lib/labels';

const LIMIT = 20;

/** Feed of automatic daily reports (TZ): director & investors see both types, head of sales - sales, accountant - financial. */
export default function ReportsPage() {
  const me = useUser();
  const fixedType: DailyReportType | undefined = me.role === 'head_of_sales' ? 'sales' : me.role === 'accountant' ? 'financial' : undefined;
  const [type, setType] = React.useState<'all' | DailyReportType>(fixedType ?? 'all');
  const [range, setRange] = React.useState({ from: '', to: '' });
  const [offset, setOffset] = React.useState(0);
  const [regenOpen, setRegenOpen] = React.useState(false);

  const params = { type: type === 'all' ? undefined : type, from: range.from || undefined, to: range.to || undefined, limit: LIMIT, offset };
  const q = useQuery({ queryKey: ['reports', params], queryFn: () => reportsApi.list(params) });

  return (
    <>
      <PageHeader
        title="Ежедневные отчёты"
        description="Формируются автоматически при завершении смены бухгалтером (финансовый) и начальником продаж (продажи)."
        actions={me.role === 'director' && <Button variant="outline" onClick={() => setRegenOpen(true)}><RefreshCw /> Пересоздать отчёт</Button>}
      />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        {fixedType ? (
          <Badge tone="info">{fixedType === 'financial' ? 'Финансовые отчёты' : 'Отчёты по продажам'}</Badge>
        ) : (
          <Tabs value={type} onValueChange={(v) => { setType(v as typeof type); setOffset(0); }}>
            <TabsList aria-label="Тип отчёта">
              <TabsTrigger value="all">Все</TabsTrigger>
              <TabsTrigger value="financial">Финансовые</TabsTrigger>
              <TabsTrigger value="sales">Продажи</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
        <DateRange from={range.from} to={range.to} max={todayIso()} onChange={(from, to) => { setRange({ from, to }); setOffset(0); }} />
      </div>

      {q.isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-40" />)}</div>
      ) : q.isError ? (
        <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card>
      ) : q.data && q.data.items.length === 0 ? (
        <Card><EmptyState title="Отчётов пока нет" description="Отчёт появится, когда бухгалтер или начальник продаж завершит смену." /></Card>
      ) : (
        <ol className="space-y-3">
          {q.data?.items.map((r) => (
            <li key={r.id}>
              <Card className="overflow-hidden">
                <div className="flex flex-wrap items-center gap-3 border-b bg-muted/40 px-4 py-2.5">
                  <span className={`grid size-8 place-items-center rounded-md ${r.type === 'financial' ? 'bg-accent-soft text-accent' : 'bg-primary-soft text-primary'}`}>
                    {r.type === 'financial' ? <Landmark className="size-4" aria-hidden /> : <ChartNoAxesColumn className="size-4" aria-hidden />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{REPORT_TYPE[r.type]} отчёт за {formatDate(r.date)}</p>
                    <p className="text-xs text-muted-foreground">Сформирован {formatDateTime(r.generatedAt)}</p>
                  </div>
                </div>
                <pre className="max-h-96 overflow-auto whitespace-pre-wrap px-4 py-3 font-sans text-sm leading-6">{r.summary}</pre>
              </Card>
            </li>
          ))}
        </ol>
      )}
      {q.data && (
        <Card className="mt-3 border-0 bg-transparent shadow-none">
          <Pagination total={q.data.total} limit={LIMIT} offset={offset} onChange={setOffset} />
        </Card>
      )}
      <RegenerateDialog open={regenOpen} onOpenChange={setRegenOpen} />
    </>
  );
}

function RegenerateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [type, setType] = React.useState<DailyReportType>('financial');
  const [date, setDate] = React.useState(todayIso());
  const m = useMutation({
    mutationFn: () => reportsApi.regenerate(type, date),
    onSuccess: () => {
      toast.success('Отчёт пересоздан');
      void qc.invalidateQueries({ queryKey: ['reports'] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" title="Пересоздать отчёт" description="Отчёт за дату будет сформирован заново по текущим данным.">
        <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-4">
          <Field label="Тип" htmlFor="regen-type">
            <NativeSelect id="regen-type" value={type} onChange={(e) => setType(e.target.value as DailyReportType)}>
              <option value="financial">Финансовый</option>
              <option value="sales">Продажи</option>
            </NativeSelect>
          </Field>
          <Field label="Дата" htmlFor="regen-date">
            <Input id="regen-date" type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
            <Button type="submit" loading={m.isPending}>Пересоздать</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
