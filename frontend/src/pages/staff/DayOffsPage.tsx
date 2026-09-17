import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { dayOffsApi } from '@/api/endpoints';
import type { DayOff } from '@/api/types';
import { useUser } from '@/auth/AuthProvider';
import { useStepUp } from '@/auth/StepUpProvider';
import { EmptyState, ErrorState, PageHeader, Pagination, TableSkeleton } from '@/components/app';
import { DateRange } from '@/components/DateRange';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog, Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useUsers } from '@/hooks/useUsers';
import { SHIFT_ROLES } from '@/layout/nav';
import { formatDate, todayIso } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';

const LIMIT = 30;

export default function DayOffsPage() {
  const me = useUser();
  const qc = useQueryClient();
  const stepUp = useStepUp();
  const { nameOf } = useUsers();
  const canManage = me.role === 'director' || me.role === 'head_of_sales';
  const [range, setRange] = React.useState({ from: '', to: '' });
  const [offset, setOffset] = React.useState(0);
  const [dialog, setDialog] = React.useState<{ mode: 'create' } | { mode: 'edit'; dayOff: DayOff } | null>(null);
  const [deleting, setDeleting] = React.useState<DayOff | null>(null);

  const params = { from: range.from || undefined, to: range.to || undefined, limit: LIMIT, offset };
  const q = useQuery({ queryKey: ['day-offs', params], queryFn: () => dayOffsApi.list(params) });

  const remove = async (d: DayOff) => {
    setDeleting(null);
    await stepUp({ action: 'day_off.delete', resourceId: d.id, title: `Удаление выходного ${formatDate(d.date)}`, run: (h) => dayOffsApi.remove(d.id, h) })
      .then(() => { toast.success('Выходной удалён'); void qc.invalidateQueries({ queryKey: ['day-offs'] }); })
      .catch(() => undefined);
  };

  return (
    <>
      <PageHeader
        title="Выходные"
        description="Заранее согласованные выходные: в эти дни прогул не фиксируется. Задним числом назначить нельзя."
        actions={canManage && <Button onClick={() => setDialog({ mode: 'create' })}><Plus /> Назначить выходной</Button>}
      />
      <Card>
        <div className="border-b p-3"><DateRange from={range.from} to={range.to} onChange={(from, to) => { setRange({ from, to }); setOffset(0); }} /></div>
        {q.isLoading ? <TableSkeleton cols={4} /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : q.data?.items.length === 0 ? (
          <EmptyState title="Выходных нет" action={canManage && <Button variant="outline" onClick={() => setDialog({ mode: 'create' })}><Plus /> Назначить выходной</Button>} />
        ) : (
          <Table>
            <THead><TR><TH>Дата</TH><TH>Сотрудник</TH><TH>Причина</TH><TH>Одобрил</TH>{canManage && <TH className="w-24"><span className="sr-only">Действия</span></TH>}</TR></THead>
            <TBody>
              {q.data?.items.map((d) => {
                const future = d.date >= todayIso();
                return (
                  <TR key={d.id}>
                    <TD className="whitespace-nowrap font-medium">{formatDate(d.date)}</TD>
                    <TD>{nameOf(d.userId)}</TD>
                    <TD className="max-w-80 truncate text-muted-foreground" title={d.reason ?? undefined}>{d.reason ?? '—'}</TD>
                    <TD>{nameOf(d.approvedById)}</TD>
                    {canManage && (
                      <TD>
                        {future && (
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="size-8" aria-label="Изменить" onClick={() => setDialog({ mode: 'edit', dayOff: d })}><Pencil /></Button>
                            <Button variant="ghost" size="icon" className="size-8 text-destructive" aria-label="Удалить" onClick={() => setDeleting(d)}><Trash2 /></Button>
                          </div>
                        )}
                      </TD>
                    )}
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
        {q.data && <Pagination total={q.data.total} limit={LIMIT} offset={offset} onChange={setOffset} />}
      </Card>
      {dialog && <DayOffDialog state={dialog} onClose={() => setDialog(null)} />}
      <ConfirmDialog open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)} destructive title="Удалить выходной?" description="Если сотрудник не откроет смену в этот день, будет зафиксирован прогул. Потребуется код из письма." confirmLabel="Удалить" onConfirm={() => deleting && void remove(deleting)} />
    </>
  );
}

const schema = z.object({
  userId: z.string().min(1, 'Выберите сотрудника'),
  date: z.string().min(1, 'Укажите дату').refine((d) => d >= todayIso(), 'Только сегодня или будущая дата'),
  reason: z.string().max(500).optional(),
});

function DayOffDialog({ state, onClose }: { state: { mode: 'create' } | { mode: 'edit'; dayOff: DayOff }; onClose: () => void }) {
  const me = useUser();
  const qc = useQueryClient();
  const { list } = useUsers();
  const editing = state.mode === 'edit' ? state.dayOff : null;
  const employees = list.filter((u) => u.status === 'active' && SHIFT_ROLES.includes(u.role) && (me.role === 'director' || u.teamLeadId === me.id));
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { userId: editing?.userId ?? '', date: editing?.date ?? '', reason: editing?.reason ?? '' } });
  const m = useMutation({
    mutationFn: (v: z.infer<typeof schema>) => (editing ? dayOffsApi.update(editing.id, { date: v.date, reason: v.reason || undefined }) : dayOffsApi.create({ userId: v.userId, date: v.date, reason: v.reason || undefined })),
    onSuccess: () => { toast.success(editing ? 'Выходной изменён' : 'Выходной назначен'); void qc.invalidateQueries({ queryKey: ['day-offs'] }); onClose(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const e = form.formState.errors;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="sm" title={editing ? 'Изменить выходной' : 'Назначить выходной'}>
        <form onSubmit={form.handleSubmit((v) => m.mutate(v))} className="space-y-4" noValidate>
          <Field label="Сотрудник" htmlFor="do-user" required error={e.userId?.message}>
            <NativeSelect id="do-user" disabled={Boolean(editing)} aria-invalid={Boolean(e.userId)} {...form.register('userId')}>
              <option value="">Выберите…</option>
              {employees.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Дата" htmlFor="do-date" required error={e.date?.message}><Input id="do-date" type="date" min={todayIso()} aria-invalid={Boolean(e.date)} {...form.register('date')} /></Field>
          <Field label="Причина" htmlFor="do-reason" hint="Хранится в зашифрованном виде"><Textarea id="do-reason" rows={3} {...form.register('reason')} /></Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Отмена</Button>
            <Button type="submit" loading={m.isPending}>Сохранить</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
