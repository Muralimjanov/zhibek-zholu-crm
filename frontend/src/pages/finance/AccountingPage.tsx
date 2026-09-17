import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownRight, ArrowUpRight, Download, FileSpreadsheet, Lock, MoreHorizontal, Paperclip, Pencil, Plus, Scale, Trash2, Upload } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { accountingApi, type TransactionInput } from '@/api/endpoints';
import type { Transaction, TransactionCategory, TransactionType } from '@/api/types';
import { useUser } from '@/auth/AuthProvider';
import { useStepUp } from '@/auth/StepUpProvider';
import { EmptyState, ErrorState, Money, PageHeader, Pagination, StatCard, TableSkeleton } from '@/components/app';
import { DateRange } from '@/components/DateRange';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog, Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { currentPeriod, formatDate, formatDateTime, formatPeriod, monthStartIso, todayIso } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import { CATEGORY_LABELS, EXPENSE_CATEGORIES, INCOME_CATEGORIES, TRANSACTION_TYPE } from '@/lib/labels';
import { formatSom, somToTyiyn, tyiynToSomInput } from '@/lib/money';

export default function AccountingPage() {
  const me = useUser();
  return (
    <>
      <PageHeader title="Бухгалтерия" description={me.role === 'accountant' ? 'Приходы и расходы по категориям, вложения чеков, закрытие месяцев.' : 'Все операции компании с разбивкой по категориям.'} />
      <Tabs defaultValue="transactions">
        <TabsList className="mb-4" aria-label="Разделы бухгалтерии">
          <TabsTrigger value="transactions">Операции</TabsTrigger>
          <TabsTrigger value="summary">Отчёт по категориям</TabsTrigger>
          <TabsTrigger value="periods">Закрытие месяцев</TabsTrigger>
        </TabsList>
        <TabsContent value="transactions"><TransactionsTab /></TabsContent>
        <TabsContent value="summary"><SummaryTab /></TabsContent>
        <TabsContent value="periods"><PeriodsTab /></TabsContent>
      </Tabs>
    </>
  );
}

const LIMIT = 30;

function TransactionsTab() {
  const me = useUser();
  const isAccountant = me.role === 'accountant';
  const qc = useQueryClient();
  const stepUp = useStepUp();
  const [range, setRange] = React.useState({ from: monthStartIso(), to: todayIso() });
  const [type, setType] = React.useState<'' | TransactionType>('');
  const [category, setCategory] = React.useState<'' | TransactionCategory>('');
  const [offset, setOffset] = React.useState(0);
  const [dialog, setDialog] = React.useState<{ tx?: Transaction } | null>(null);
  const [deleting, setDeleting] = React.useState<Transaction | null>(null);
  const [uploadFor, setUploadFor] = React.useState<Transaction | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const params = { from: range.from || undefined, to: range.to || undefined, type: type || undefined, category: category || undefined, limit: LIMIT, offset };
  const q = useQuery({ queryKey: ['transactions', params], queryFn: () => accountingApi.list(params) });
  const invalidate = () => { void qc.invalidateQueries({ queryKey: ['transactions'] }); void qc.invalidateQueries({ queryKey: ['accounting-summary'] }); };

  const remove = async (t: Transaction) => {
    setDeleting(null);
    await stepUp({ action: 'transaction.delete', resourceId: t.id, title: `Удаление: ${CATEGORY_LABELS[t.category]}, ${formatSom(t.amountTyiyn)}`, run: (h) => accountingApi.remove(t.id, h) })
      .then(() => { toast.success('Операция удалена'); invalidate(); })
      .catch(() => undefined);
  };
  const upload = async (file: File) => {
    const t = uploadFor;
    if (!t) return;
    await stepUp({ action: 'transaction.attachment', resourceId: t.id, title: `Вложение к операции: ${file.name}`, run: (h) => accountingApi.uploadAttachment(t.id, file, h) })
      .then(() => { toast.success('Вложение загружено'); invalidate(); })
      .catch(() => undefined);
    if (fileRef.current) fileRef.current.value = '';
    setUploadFor(null);
  };
  const categories = type === 'income' ? INCOME_CATEGORIES : type === 'expense' ? EXPENSE_CATEGORIES : [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES];

  return (
    <Card>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b p-3">
        <div className="flex flex-wrap items-end gap-3">
          <DateRange from={range.from} to={range.to} max={todayIso()} onChange={(from, to) => { setRange({ from, to }); setOffset(0); }} />
          <div className="flex flex-col gap-1">
            <label htmlFor="tx-type" className="text-xs text-muted-foreground">Тип</label>
            <NativeSelect id="tx-type" value={type} onChange={(e) => { setType(e.target.value as typeof type); setCategory(''); setOffset(0); }} className="w-32"><option value="">Все</option><option value="income">Приходы</option><option value="expense">Расходы</option></NativeSelect>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="tx-category" className="text-xs text-muted-foreground">Категория</label>
            <NativeSelect id="tx-category" value={category} onChange={(e) => { setCategory(e.target.value as typeof category); setOffset(0); }} className="w-56"><option value="">Все</option>{categories.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}</NativeSelect>
          </div>
        </div>
        {isAccountant && <Button onClick={() => setDialog({})}><Plus /> Новая операция</Button>}
      </div>
      <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" aria-label="Файл вложения" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
      {q.isLoading ? <TableSkeleton cols={6} /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : q.data?.items.length === 0 ? (
        <EmptyState title="Операций нет" description="Измените фильтры или добавьте операцию." action={isAccountant && <Button variant="outline" onClick={() => setDialog({})}><Plus /> Новая операция</Button>} />
      ) : (
        <Table>
          <THead><TR><TH>Дата</TH><TH>Категория</TH><TH>Комментарий</TH><TH className="text-right">Сумма</TH><TH className="w-12"><span className="sr-only">Действия</span></TH></TR></THead>
          <TBody>
            {q.data?.items.map((t) => {
              const own = t.createdById === me.id;
              const editable = isAccountant && own && !t.periodClosed;
              return (
                <TR key={t.id}>
                  <TD className="whitespace-nowrap">
                    {formatDate(t.date)}
                    {t.periodClosed && <Lock className="ml-1.5 inline size-3.5 text-muted-foreground" aria-label="Месяц закрыт" />}
                  </TD>
                  <TD>
                    <p className="font-medium">{CATEGORY_LABELS[t.category]}</p>
                    <p className="text-xs text-muted-foreground">{TRANSACTION_TYPE[t.type]}{t.subcategory ? ` · ${t.subcategory}` : ''}</p>
                  </TD>
                  <TD className="max-w-72">
                    <p className="truncate text-muted-foreground" title={t.comment ?? undefined}>{t.comment ?? '—'}</p>
                    {t.hasAttachment && <button type="button" className="mt-0.5 inline-flex items-center gap-1 text-xs text-primary hover:underline" onClick={() => accountingApi.downloadAttachment(t.id).catch((e) => toast.error(errorMessage(e)))}><Paperclip className="size-3" aria-hidden />вложение</button>}
                  </TD>
                  <TD className={`text-right font-semibold ${t.type === 'income' ? 'text-success' : ''}`}>{t.type === 'income' ? '+' : '−'}<Money tyiyn={t.amountTyiyn} /></TD>
                  <TD>
                    {(editable || me.role === 'director' || (isAccountant && own && !t.periodClosed) || t.hasAttachment) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-8" aria-label="Действия с операцией"><MoreHorizontal /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent>
                          {editable && <DropdownMenuItem onSelect={() => setDialog({ tx: t })}><Pencil /> Изменить</DropdownMenuItem>}
                          {editable && <DropdownMenuItem onSelect={() => { setUploadFor(t); setTimeout(() => fileRef.current?.click(), 0); }}><Upload /> {t.hasAttachment ? 'Заменить вложение' : 'Прикрепить чек'}</DropdownMenuItem>}
                          {t.hasAttachment && <DropdownMenuItem onSelect={() => accountingApi.downloadAttachment(t.id).catch((e) => toast.error(errorMessage(e)))}><Download /> Скачать вложение</DropdownMenuItem>}
                          {(me.role === 'director' || editable) && (<><DropdownMenuSeparator /><DropdownMenuItem destructive onSelect={() => setDeleting(t)}><Trash2 /> Удалить</DropdownMenuItem></>)}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
      {q.data && <Pagination total={q.data.total} limit={LIMIT} offset={offset} onChange={setOffset} />}
      {dialog && <TransactionDialog tx={dialog.tx} onClose={() => setDialog(null)} onSaved={invalidate} />}
      <ConfirmDialog open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)} destructive title="Удалить операцию?" description="Операция и вложение будут удалены. Потребуется код из письма." confirmLabel="Удалить" onConfirm={() => deleting && void remove(deleting)} />
    </Card>
  );
}

const txSchema = z.object({
  type: z.enum(['income', 'expense']),
  category: z.string().min(1, 'Выберите категорию'),
  subcategory: z.string().max(200).optional(),
  amount: z.string().trim().refine((v) => { const t = somToTyiyn(v); return t !== null && t !== '0'; }, 'Сумма больше нуля, например 15000.50'),
  date: z.string().min(1, 'Укажите дату').refine((d) => d <= todayIso(), 'Дата не может быть в будущем'),
  comment: z.string().max(2000).optional(),
});

function TransactionDialog({ tx, onClose, onSaved }: { tx?: Transaction; onClose: () => void; onSaved: () => void }) {
  const stepUp = useStepUp();
  const [saving, setSaving] = React.useState(false);
  const form = useForm<z.infer<typeof txSchema>>({
    resolver: zodResolver(txSchema),
    defaultValues: tx
      ? { type: tx.type, category: tx.category, subcategory: tx.subcategory ?? '', amount: tyiynToSomInput(tx.amountTyiyn), date: tx.date, comment: tx.comment ?? '' }
      : { type: 'expense', category: '', subcategory: '', amount: '', date: todayIso(), comment: '' },
  });
  const type = form.watch('type');
  const e = form.formState.errors;
  const submit = form.handleSubmit(async (v) => {
    setSaving(true);
    const body: TransactionInput = { type: v.type, category: v.category as TransactionCategory, amountTyiyn: somToTyiyn(v.amount)!, date: v.date, subcategory: v.subcategory || undefined, comment: v.comment || undefined };
    const title = `${tx ? 'Изменение' : 'Создание'} операции: ${CATEGORY_LABELS[body.category]}, ${formatSom(body.amountTyiyn)}`;
    await (tx
      ? stepUp({ action: 'transaction.update', resourceId: tx.id, title, run: (h) => accountingApi.update(tx.id, body, h) })
      : stepUp({ action: 'transaction.create', title, run: (h) => accountingApi.create(body, h) }))
      .then(() => { toast.success(tx ? 'Операция обновлена' : 'Операция добавлена'); onSaved(); onClose(); })
      .catch(() => undefined)
      .finally(() => setSaving(false));
  });
  const cats = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={tx ? 'Изменить операцию' : 'Новая операция'} description="Потребуется код подтверждения из письма.">
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div role="radiogroup" aria-label="Тип операции" className="grid grid-cols-2 gap-2">
            {(['expense', 'income'] as const).map((t) => (
              <label key={t} className={`flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border text-sm font-medium transition-colors ${type === t ? (t === 'income' ? 'border-success bg-success-soft text-success' : 'border-primary bg-primary-soft text-primary') : 'hover:bg-muted'}`}>
                <input type="radio" value={t} className="sr-only" {...form.register('type', { onChange: () => form.setValue('category', '') })} />
                {t === 'income' ? <ArrowUpRight className="size-4" aria-hidden /> : <ArrowDownRight className="size-4" aria-hidden />}
                {TRANSACTION_TYPE[t]}
              </label>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Категория" htmlFor="tx-cat" required error={e.category?.message} className="sm:col-span-2">
              <NativeSelect id="tx-cat" aria-invalid={Boolean(e.category)} {...form.register('category')}><option value="">Выберите…</option>{cats.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}</NativeSelect>
            </Field>
            <Field label="Сумма, сом" htmlFor="tx-amount" required error={e.amount?.message}><Input id="tx-amount" inputMode="decimal" aria-invalid={Boolean(e.amount)} {...form.register('amount')} /></Field>
            <Field label="Дата" htmlFor="tx-date" required error={e.date?.message}><Input id="tx-date" type="date" max={todayIso()} {...form.register('date')} /></Field>
            <Field label="Подкатегория" htmlFor="tx-sub" className="sm:col-span-2"><Input id="tx-sub" {...form.register('subcategory')} /></Field>
            <Field label="Комментарий" htmlFor="tx-comment" hint="Хранится в зашифрованном виде" className="sm:col-span-2"><Textarea id="tx-comment" rows={3} {...form.register('comment')} /></Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Отмена</Button>
            <Button type="submit" loading={saving}>{tx ? 'Сохранить' : 'Добавить'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SummaryTab() {
  const [range, setRange] = React.useState({ from: monthStartIso(), to: todayIso() });
  const [exporting, setExporting] = React.useState(false);
  const q = useQuery({ queryKey: ['accounting-summary', range], queryFn: () => accountingApi.summary(range.from, range.to), enabled: Boolean(range.from && range.to) });
  const d = q.data;
  const exportXlsx = () => {
    setExporting(true);
    accountingApi.exportXlsx(range.from, range.to).catch((e) => toast.error(errorMessage(e))).finally(() => setExporting(false));
  };
  const income = d?.byCategory.filter((c) => c.type === 'income') ?? [];
  const expense = d?.byCategory.filter((c) => c.type === 'expense') ?? [];
  const Section = ({ title, rows, totalT }: { title: string; rows: typeof income; totalT?: string }) => {
    const max = rows.reduce((m, r) => (BigInt(r.amountTyiyn) > m ? BigInt(r.amountTyiyn) : m), 1n);
    return (
      <Card>
        <CardHeader><CardTitle>{title}</CardTitle><span className="font-semibold"><Money tyiyn={totalT} /></span></CardHeader>
        <ul className="divide-y">
          {rows.map((r) => (
            <li key={r.category} className="px-4 py-2.5">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span>{CATEGORY_LABELS[r.category]} <span className="text-xs text-muted-foreground">· {r.count}</span></span>
                <Money tyiyn={r.amountTyiyn} className={r.amountTyiyn === '0' ? 'text-muted-foreground' : 'font-medium'} />
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div className={`h-full rounded-full ${title === 'Приходы' ? 'bg-success' : 'bg-chart-3'}`} style={{ width: `${Number((BigInt(r.amountTyiyn) * 1000n) / max) / 10}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </Card>
    );
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <DateRange from={range.from} to={range.to} max={todayIso()} onChange={(from, to) => setRange({ from, to })} />
        <Button variant="outline" onClick={exportXlsx} loading={exporting}><FileSpreadsheet /> Экспорт в Excel</Button>
      </div>
      {q.isError ? <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card> : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Приходы" icon={ArrowUpRight} tone="success" loading={q.isLoading} value={formatSom(d?.incomeTyiyn)} />
            <StatCard label="Расходы" icon={ArrowDownRight} tone="danger" loading={q.isLoading} value={formatSom(d?.expenseTyiyn)} />
            <StatCard label="Итог периода" icon={Scale} loading={q.isLoading} value={<span className={d?.netTyiyn.startsWith('-') ? 'text-destructive' : ''}>{formatSom(d?.netTyiyn)}</span>} />
          </div>
          {q.isLoading ? <TableSkeleton rows={8} cols={2} /> : (
            <div className="grid gap-4 lg:grid-cols-2">
              <Section title="Приходы" rows={income} totalT={d?.incomeTyiyn} />
              <Section title="Расходы" rows={expense} totalT={d?.expenseTyiyn} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PeriodsTab() {
  const me = useUser();
  const qc = useQueryClient();
  const stepUp = useStepUp();
  const q = useQuery({ queryKey: ['accounting-periods'], queryFn: accountingApi.periods });
  const [period, setPeriod] = React.useState('');
  const [confirm, setConfirm] = React.useState(false);
  const closed = new Set((q.data ?? []).map((p) => p.period));
  const close = async () => {
    setConfirm(false);
    await stepUp({ action: 'accounting.period.close', resourceId: period, title: `Закрытие месяца: ${formatPeriod(period)}`, run: (h) => accountingApi.closePeriod(period, h) })
      .then(() => { toast.success('Месяц закрыт'); setPeriod(''); void qc.invalidateQueries({ queryKey: ['accounting-periods'] }); void qc.invalidateQueries({ queryKey: ['transactions'] }); })
      .catch(() => undefined);
  };
  const closeMutation = useMutation({ mutationFn: close });
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {me.role === 'accountant' && (
        <Card className="h-fit p-4">
          <h2 className="text-sm font-semibold">Закрыть месяц</h2>
          <p className="mt-1 text-sm text-muted-foreground">После закрытия операции месяца нельзя изменять и удалять. Закрыть можно только завершившийся месяц.</p>
          <div className="mt-4 flex flex-col gap-3">
            <Field label="Месяц" htmlFor="close-period"><Input id="close-period" type="month" max={currentPeriod()} value={period} onChange={(e) => setPeriod(e.target.value)} /></Field>
            <Button disabled={!period || closed.has(period) || period >= currentPeriod()} onClick={() => setConfirm(true)}><Lock /> Закрыть месяц</Button>
            {period && closed.has(period) && <p className="text-xs text-muted-foreground">Этот месяц уже закрыт.</p>}
            {period && period >= currentPeriod() && <p className="text-xs text-muted-foreground">Месяц ещё не закончился.</p>}
          </div>
        </Card>
      )}
      <Card className={me.role === 'accountant' ? 'lg:col-span-2' : 'lg:col-span-3'}>
        <CardHeader><CardTitle>Закрытые месяцы</CardTitle></CardHeader>
        {q.isLoading ? <TableSkeleton rows={3} cols={2} /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : q.data?.length === 0 ? (
          <EmptyState icon={Lock} title="Закрытых месяцев пока нет" />
        ) : (
          <ul className="divide-y">
            {q.data?.map((p) => (
              <li key={p.period} className="flex items-center justify-between px-4 py-3">
                <span className="font-medium capitalize">{formatPeriod(p.period)}</span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground"><Badge tone="neutral">Закрыт</Badge>{formatDateTime(p.closedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title={`Закрыть ${period ? formatPeriod(period) : ''}?`} description="Отменить закрытие нельзя. Потребуется код из письма." confirmLabel="Закрыть месяц" loading={closeMutation.isPending} onConfirm={() => closeMutation.mutate()} />
    </div>
  );
}
