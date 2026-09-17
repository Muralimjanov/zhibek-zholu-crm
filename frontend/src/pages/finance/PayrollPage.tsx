import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calculator, CheckCheck, Pencil, Settings2, Trash2 } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { payrollApi } from '@/api/endpoints';
import type { PayrollEntry } from '@/api/types';
import { useUser } from '@/auth/AuthProvider';
import { useStepUp } from '@/auth/StepUpProvider';
import { EmptyState, ErrorState, Money, PageHeader, StatCard, TableSkeleton } from '@/components/app';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog, Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { currentPeriod, formatDateTime, formatPeriod } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import { PAYROLL_STATUS, ROLE_LABELS } from '@/lib/labels';
import { formatPercent, formatSom, somToTyiyn, tyiynToSomInput } from '@/lib/money';
import { dec, percentField, somField } from '../sales/shared';

export default function PayrollPage() {
  const me = useUser();
  const isAccountant = me.role === 'accountant';
  const isManager = me.role === 'sales_manager';
  const [period, setPeriod] = React.useState(isManager ? '' : currentPeriod());
  const qc = useQueryClient();
  const stepUp = useStepUp();
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<PayrollEntry | null>(null);
  const [deleting, setDeleting] = React.useState<PayrollEntry | null>(null);
  const [confirmGenerate, setConfirmGenerate] = React.useState(false);

  const entries = useQuery({ queryKey: ['payroll', period], queryFn: () => payrollApi.list({ period: period || undefined }) });
  const settings = useQuery({ queryKey: ['payroll-settings'], queryFn: payrollApi.settings, enabled: !isManager });

  const generate = useMutation({
    mutationFn: () => payrollApi.generate(period),
    onSuccess: (rows) => { toast.success(`Рассчитано начислений: ${rows.length}`); setConfirmGenerate(false); void qc.invalidateQueries({ queryKey: ['payroll'] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const confirmEntry = async (e: PayrollEntry) => {
    await stepUp({ action: 'payroll.confirm', resourceId: e.id, title: `Подтверждение зарплаты: ${e.employeeFullName}, ${formatPeriod(e.period)} — ${formatSom(e.finalAmountTyiyn)}`, run: (h) => payrollApi.confirm(e.id, h) })
      .then(() => { toast.success('Начисление подтверждено'); void qc.invalidateQueries({ queryKey: ['payroll'] }); })
      .catch(() => undefined);
  };
  const removeEntry = async (e: PayrollEntry) => {
    setDeleting(null);
    await stepUp({ action: 'payroll.delete', resourceId: e.id, title: `Удаление начисления: ${e.employeeFullName}`, run: (h) => payrollApi.remove(e.id, h) })
      .then(() => { toast.success('Начисление удалено'); void qc.invalidateQueries({ queryKey: ['payroll'] }); })
      .catch(() => undefined);
  };

  const rows = entries.data ?? [];
  const total = rows.reduce((a, r) => a + BigInt(r.finalAmountTyiyn), 0n).toString();
  const drafts = rows.filter((r) => r.status === 'draft').length;

  return (
    <>
      <PageHeader
        title={isManager ? 'Моя зарплата' : 'Зарплата'}
        description="Итог к выплате = оклад − штраф за прогулы − налог."
        actions={
          !isManager && (
            <>
              <div className="flex flex-col gap-1">
                <label htmlFor="payroll-period" className="text-xs text-muted-foreground">Месяц</label>
                <Input id="payroll-period" type="month" value={period} max={currentPeriod()} onChange={(e) => setPeriod(e.target.value)} className="w-44" />
              </div>
              {isAccountant && (
                <>
                  <Button variant="outline" className="self-end" onClick={() => setSettingsOpen(true)}><Settings2 /> Настройки</Button>
                  <Button className="self-end" disabled={!period} onClick={() => setConfirmGenerate(true)}><Calculator /> Рассчитать</Button>
                </>
              )}
            </>
          )
        }
      />

      {!isManager && (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <StatCard label="К выплате за месяц" value={formatSom(total)} loading={entries.isLoading} hint={`${rows.length} сотрудник(ов)`} />
          <StatCard label="Ожидают подтверждения" value={drafts} tone={drafts > 0 ? 'warning' : 'success'} loading={entries.isLoading} />
          <StatCard
            label="Настройки"
            tone="info"
            loading={settings.isLoading}
            value={settings.data ? `${formatSom(settings.data.finePerMissedShiftTyiyn)}` : 'Не заданы'}
            hint={settings.data ? `штраф за прогул · налог ${formatPercent(settings.data.taxRatePercent)}` : isAccountant ? 'Задайте штраф и налог перед расчётом' : undefined}
          />
        </div>
      )}

      <Card>
        {!isManager && <CardHeader><CardTitle>{period ? formatPeriod(period) : 'Все месяцы'}</CardTitle></CardHeader>}
        {entries.isLoading ? <TableSkeleton cols={7} /> : entries.isError ? <ErrorState error={entries.error} onRetry={() => entries.refetch()} /> : rows.length === 0 ? (
          <EmptyState title="Начислений нет" description={isAccountant ? 'Нажмите «Рассчитать», чтобы сформировать зарплату за месяц.' : 'Бухгалтер ещё не рассчитал зарплату.'} />
        ) : (
          <Table>
            <THead>
              <TR>
                {isManager ? <TH>Месяц</TH> : <TH>Сотрудник</TH>}
                <TH className="text-right">Оклад</TH>
                <TH className="text-right">Прогулы</TH>
                <TH className="text-right">Штраф</TH>
                <TH className="text-right">Налог</TH>
                <TH className="text-right">Итого</TH>
                <TH>Статус</TH>
                {(isAccountant || me.role === 'director') && <TH className="w-28"><span className="sr-only">Действия</span></TH>}
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD>
                    {isManager ? <span className="font-medium capitalize">{formatPeriod(r.period)}</span> : (
                      <><p className="font-medium">{r.employeeFullName}</p><p className="text-xs text-muted-foreground">{ROLE_LABELS[r.employeeRole]}</p></>
                    )}
                  </TD>
                  <TD className="text-right"><Money tyiyn={r.baseSalaryTyiyn} /></TD>
                  <TD className={`tabular text-right ${r.missedShiftsCount > 0 ? 'text-destructive' : ''}`}>{r.missedShiftsCount}</TD>
                  <TD className="text-right"><Money tyiyn={r.fineAmountTyiyn} />{r.fineManuallyAdjusted && <p className="text-xs text-muted-foreground">изменён вручную</p>}</TD>
                  <TD className="text-right"><Money tyiyn={r.taxAmountTyiyn} /><p className="text-xs text-muted-foreground">{formatPercent(r.taxRatePercent)}</p></TD>
                  <TD className="text-right font-semibold"><Money tyiyn={r.finalAmountTyiyn} tone="auto" /></TD>
                  <TD>
                    <Badge tone={PAYROLL_STATUS[r.status].tone}>{PAYROLL_STATUS[r.status].label}</Badge>
                    {r.confirmedAt && <p className="mt-0.5 text-xs text-muted-foreground">{formatDateTime(r.confirmedAt)}</p>}
                  </TD>
                  {(isAccountant || me.role === 'director') && (
                    <TD>
                      <div className="flex justify-end gap-1">
                        {isAccountant && r.status === 'draft' && (
                          <>
                            <Button variant="ghost" size="icon" className="size-8" aria-label={`Изменить: ${r.employeeFullName}`} onClick={() => setEditing(r)}><Pencil /></Button>
                            <Button variant="outline" size="sm" onClick={() => void confirmEntry(r)}><CheckCheck /> Подтвердить</Button>
                          </>
                        )}
                        {me.role === 'director' && <Button variant="ghost" size="icon" className="size-8 text-destructive" aria-label={`Удалить: ${r.employeeFullName}`} onClick={() => setDeleting(r)}><Trash2 /></Button>}
                      </div>
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {settingsOpen && <SettingsDialog current={settings.data ?? null} onClose={() => setSettingsOpen(false)} />}
      {editing && <EditEntryDialog entry={editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog open={confirmGenerate} onOpenChange={setConfirmGenerate} title={`Рассчитать зарплату за ${period ? formatPeriod(period) : ''}?`} description="Черновики будут пересчитаны по текущим прогулам и настройкам. Подтверждённые начисления не изменятся." confirmLabel="Рассчитать" loading={generate.isPending} onConfirm={() => generate.mutate()} />
      <ConfirmDialog open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)} destructive title="Удалить начисление?" description="Потребуется код из письма." confirmLabel="Удалить" onConfirm={() => deleting && void removeEntry(deleting)} />
    </>
  );
}

const settingsSchema = z.object({ fine: somField, tax: percentField });

function SettingsDialog({ current, onClose }: { current: { finePerMissedShiftTyiyn: string; taxRatePercent: string } | null; onClose: () => void }) {
  const qc = useQueryClient();
  const stepUp = useStepUp();
  const [saving, setSaving] = React.useState(false);
  const form = useForm<z.infer<typeof settingsSchema>>({ resolver: zodResolver(settingsSchema), defaultValues: { fine: tyiynToSomInput(current?.finePerMissedShiftTyiyn), tax: current?.taxRatePercent ?? '' } });
  const e = form.formState.errors;
  const submit = form.handleSubmit(async (v) => {
    setSaving(true);
    const body = { finePerMissedShiftTyiyn: somToTyiyn(v.fine)!, taxRatePercent: dec(v.tax) };
    await stepUp({ action: 'payroll.settings.update', title: 'Изменение настроек зарплаты', run: (h) => payrollApi.putSettings(body, h) })
      .then(() => { toast.success('Настройки сохранены'); void qc.invalidateQueries({ queryKey: ['payroll-settings'] }); onClose(); })
      .catch(() => undefined)
      .finally(() => setSaving(false));
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="sm" title="Настройки зарплаты" description="Применяются при следующем расчёте черновиков.">
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Штраф за один прогул, сом" htmlFor="ps-fine" required error={e.fine?.message}><Input id="ps-fine" inputMode="decimal" {...form.register('fine')} /></Field>
          <Field label="Ставка налога, %" htmlFor="ps-tax" required error={e.tax?.message}><Input id="ps-tax" inputMode="decimal" {...form.register('tax')} /></Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Отмена</Button>
            <Button type="submit" loading={saving}>Сохранить</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const entrySchema = z.object({ base: somField, fine: somField });

function EditEntryDialog({ entry, onClose }: { entry: PayrollEntry; onClose: () => void }) {
  const qc = useQueryClient();
  const form = useForm<z.infer<typeof entrySchema>>({ resolver: zodResolver(entrySchema), defaultValues: { base: tyiynToSomInput(entry.baseSalaryTyiyn) || '0', fine: tyiynToSomInput(entry.fineAmountTyiyn) || '0' } });
  const m = useMutation({
    mutationFn: (v: z.infer<typeof entrySchema>) => {
      const body: { baseSalaryTyiyn?: string; fineAmountTyiyn?: string } = {};
      const base = somToTyiyn(v.base)!;
      const fine = somToTyiyn(v.fine)!;
      if (base !== entry.baseSalaryTyiyn) body.baseSalaryTyiyn = base;
      if (fine !== entry.fineAmountTyiyn) body.fineAmountTyiyn = fine;
      return payrollApi.update(entry.id, body);
    },
    onSuccess: () => { toast.success('Начисление обновлено'); void qc.invalidateQueries({ queryKey: ['payroll'] }); onClose(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const e = form.formState.errors;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="sm" title={entry.employeeFullName} description={`${formatPeriod(entry.period)} · прогулов: ${entry.missedShiftsCount}`}>
        <form onSubmit={form.handleSubmit((v) => m.mutate(v))} className="space-y-4" noValidate>
          <Field label="Оклад, сом" htmlFor="pe-base" required error={e.base?.message}><Input id="pe-base" inputMode="decimal" {...form.register('base')} /></Field>
          <Field label="Штраф, сом" htmlFor="pe-fine" required error={e.fine?.message} hint={`По настройкам: ${entry.missedShiftsCount} × ${formatSom(entry.finePerMissedShiftTyiyn)}`}><Input id="pe-fine" inputMode="decimal" {...form.register('fine')} /></Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Отмена</Button>
            <Button type="submit" loading={m.isPending}>Сохранить</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
