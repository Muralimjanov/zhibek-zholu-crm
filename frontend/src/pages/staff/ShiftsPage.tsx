import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { shiftsApi } from '@/api/endpoints';
import type { Shift, ShiftStatus } from '@/api/types';
import { useUser } from '@/auth/AuthProvider';
import { useStepUp } from '@/auth/StepUpProvider';
import { EmptyState, ErrorState, PageHeader, Pagination, TableSkeleton } from '@/components/app';
import { DateRange } from '@/components/DateRange';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog, Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useUsers } from '@/hooks/useUsers';
import { ShiftControl } from '@/layout/ShiftControl';
import { SHIFT_ROLES } from '@/layout/nav';
import { formatDate, formatTime, monthStartIso, todayIso } from '@/lib/dates';
import { SHIFT_STATUS } from '@/lib/labels';

const LIMIT = 30;

export default function ShiftsPage() {
  const me = useUser();
  const { list: users, nameOf } = useUsers();
  const [range, setRange] = React.useState({ from: monthStartIso(), to: todayIso() });
  const [status, setStatus] = React.useState<'' | ShiftStatus>('');
  const [userId, setUserId] = React.useState('');
  const [offset, setOffset] = React.useState(0);
  const [editing, setEditing] = React.useState<Shift | null>(null);
  const [deleting, setDeleting] = React.useState<Shift | null>(null);
  const qc = useQueryClient();
  const stepUp = useStepUp();

  const params = { from: range.from, to: range.to, status: status || undefined, userId: userId || undefined, limit: LIMIT, offset };
  const q = useQuery({ queryKey: ['shifts', params], queryFn: () => shiftsApi.list(params) });
  const showPeople = me.role !== 'sales_manager';
  const isDirector = me.role === 'director';

  const remove = async (s: Shift) => {
    setDeleting(null);
    await stepUp({ action: 'shift.delete', resourceId: s.id, title: `Удаление смены за ${formatDate(s.date)}`, run: (h) => shiftsApi.remove(s.id, h) })
      .then(() => { toast.success('Смена удалена'); void qc.invalidateQueries({ queryKey: ['shifts'] }); })
      .catch(() => undefined);
  };

  return (
    <>
      <PageHeader
        title="Смены"
        description="Сотрудник сам открывает и завершает смену. Если смены нет и нет выходного — день фиксируется как прогул автоматически."
        actions={SHIFT_ROLES.includes(me.role) && <ShiftControl />}
      />
      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b p-3">
          <DateRange from={range.from} to={range.to} max={todayIso()} onChange={(from, to) => { setRange({ from, to }); setOffset(0); }} />
          <div className="flex flex-col gap-1">
            <label htmlFor="shift-status" className="text-xs text-muted-foreground">Статус</label>
            <NativeSelect id="shift-status" value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setOffset(0); }} className="w-40">
              <option value="">Все</option>
              <option value="open">Открыта</option>
              <option value="closed">Закрыта</option>
              <option value="missed">Прогул</option>
            </NativeSelect>
          </div>
          {(me.role === 'director' || me.role === 'head_of_sales') && (
            <div className="flex flex-col gap-1">
              <label htmlFor="shift-user" className="text-xs text-muted-foreground">Сотрудник</label>
              <NativeSelect id="shift-user" value={userId} onChange={(e) => { setUserId(e.target.value); setOffset(0); }} className="w-56">
                <option value="">Все</option>
                {users.filter((u) => SHIFT_ROLES.includes(u.role)).map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
              </NativeSelect>
            </div>
          )}
        </div>
        {q.isLoading ? <TableSkeleton cols={5} /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : q.data?.items.length === 0 ? (
          <EmptyState title="Смен за период нет" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Дата</TH>
                {showPeople && <TH>Сотрудник</TH>}
                <TH>Начало</TH>
                <TH>Конец</TH>
                <TH>Статус</TH>
                {isDirector && <TH className="w-12"><span className="sr-only">Действия</span></TH>}
              </TR>
            </THead>
            <TBody>
              {q.data?.items.map((s) => (
                <TR key={s.id}>
                  <TD className="whitespace-nowrap font-medium">{formatDate(s.date)}</TD>
                  {showPeople && <TD>{nameOf(s.userId)}</TD>}
                  <TD className="tabular">{formatTime(s.openedAt)}</TD>
                  <TD className="tabular">{formatTime(s.closedAt)}</TD>
                  <TD><Badge tone={SHIFT_STATUS[s.status].tone}>{SHIFT_STATUS[s.status].label}</Badge></TD>
                  {isDirector && (
                    <TD>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-8" aria-label="Действия со сменой"><MoreHorizontal /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onSelect={() => setEditing(s)}><Pencil /> Коррекция</DropdownMenuItem>
                          <DropdownMenuItem destructive onSelect={() => setDeleting(s)}><Trash2 /> Удалить</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        {q.data && <Pagination total={q.data.total} limit={LIMIT} offset={offset} onChange={setOffset} />}
      </Card>
      {editing && <CorrectShiftDialog shift={editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)} destructive title="Удалить смену?" description="Запись о смене будет удалена. Потребуется код из письма." confirmLabel="Удалить" onConfirm={() => deleting && void remove(deleting)} />
    </>
  );
}

const schema = z.object({ status: z.enum(['open', 'closed', 'missed']), openedAt: z.string().optional(), closedAt: z.string().optional() });

/** datetime-local value (browser local time) <-> ISO. */
const toLocalInput = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : '');

function CorrectShiftDialog({ shift, onClose }: { shift: Shift; onClose: () => void }) {
  const qc = useQueryClient();
  const stepUp = useStepUp();
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { status: shift.status, openedAt: toLocalInput(shift.openedAt), closedAt: toLocalInput(shift.closedAt) } });
  const [saving, setSaving] = React.useState(false);
  const submit = form.handleSubmit(async (v) => {
    setSaving(true);
    const body = { status: v.status, openedAt: v.openedAt ? new Date(v.openedAt).toISOString() : undefined, closedAt: v.closedAt ? new Date(v.closedAt).toISOString() : undefined };
    await stepUp({ action: 'shift.update', resourceId: shift.id, title: `Коррекция смены за ${formatDate(shift.date)}`, run: (h) => shiftsApi.correct(shift.id, body, h) })
      .then(() => { toast.success('Смена скорректирована'); void qc.invalidateQueries({ queryKey: ['shifts'] }); onClose(); })
      .catch(() => undefined)
      .finally(() => setSaving(false));
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="sm" title="Коррекция смены" description={formatDate(shift.date)}>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Статус" htmlFor="cs-status"><NativeSelect id="cs-status" {...form.register('status')}><option value="open">Открыта</option><option value="closed">Закрыта</option><option value="missed">Прогул</option></NativeSelect></Field>
          <Field label="Начало" htmlFor="cs-open"><Input id="cs-open" type="datetime-local" {...form.register('openedAt')} /></Field>
          <Field label="Конец" htmlFor="cs-close"><Input id="cs-close" type="datetime-local" {...form.register('closedAt')} /></Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Отмена</Button>
            <Button type="submit" loading={saving}>Сохранить</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
