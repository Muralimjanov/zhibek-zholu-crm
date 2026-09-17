import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Clock, ShieldCheck, UserPlus, UserX, X } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { usersApi } from '@/api/endpoints';
import type { PendingAction } from '@/api/types';
import { EmptyState, ErrorState, PageHeader, TableSkeleton } from '@/components/app';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog, Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { useUsers } from '@/hooks/useUsers';
import { formatDateTime } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';

/** Maker-checker: account creation/disabling waits for a Director's emailed code. */
export default function ApprovalsPage() {
  const q = useQuery({ queryKey: ['pending-actions'], queryFn: usersApi.pending, refetchInterval: 30_000 });
  const { nameOf } = useUsers();
  const [confirming, setConfirming] = React.useState<PendingAction | null>(null);
  const [rejecting, setRejecting] = React.useState<PendingAction | null>(null);
  const qc = useQueryClient();
  const reject = useMutation({
    mutationFn: (a: PendingAction) => usersApi.reject(a.id),
    onSuccess: () => { toast.success('Запрос отклонён'); setRejecting(null); void qc.invalidateQueries({ queryKey: ['pending-actions'] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <>
      <PageHeader title="Подтверждения" description="Запросы на создание и отключение аккаунтов. Код приходит на почту всех директоров и действует 10 минут." />
      <Card>
        {q.isLoading ? <TableSkeleton rows={3} cols={3} /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : q.data?.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="Нет запросов, ожидающих подтверждения" />
        ) : (
          <ul className="divide-y">
            {q.data?.map((a) => (
              <li key={a.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <span className={`grid size-10 shrink-0 place-items-center rounded-full ${a.type === 'create_user' ? 'bg-primary-soft text-primary' : 'bg-destructive-soft text-destructive'}`}>
                  {a.type === 'create_user' ? <UserPlus className="size-5" aria-hidden /> : <UserX className="size-5" aria-hidden />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{a.summary}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                    <span>Инициатор: {nameOf(a.initiatorUserId)}</span>
                    <span>Создан {formatDateTime(a.createdAt)}</span>
                    <span className="inline-flex items-center gap-1"><Clock className="size-3" aria-hidden />до {formatDateTime(a.expiresAt)}</span>
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setRejecting(a)}><X /> Отклонить</Button>
                  <Button onClick={() => setConfirming(a)}><Check /> Подтвердить</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {confirming && <ConfirmActionDialog action={confirming} onClose={() => setConfirming(null)} />}
      <ConfirmDialog open={Boolean(rejecting)} onOpenChange={(o) => !o && setRejecting(null)} title="Отклонить запрос?" description={rejecting?.summary} confirmLabel="Отклонить" loading={reject.isPending} onConfirm={() => rejecting && reject.mutate(rejecting)} />
    </>
  );
}

function ConfirmActionDialog({ action, onClose }: { action: PendingAction; onClose: () => void }) {
  const [code, setCode] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => usersApi.confirm(action.id, code.replace(/\s/g, '').toUpperCase()),
    onSuccess: (u) => {
      toast.success(action.type === 'create_user' ? `Аккаунт ${u.username} создан` : `Аккаунт ${u.username} отключён`);
      void qc.invalidateQueries({ queryKey: ['pending-actions'] });
      void qc.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="sm" title="Подтверждение кодом" description={action.summary}>
        <form onSubmit={(e) => { e.preventDefault(); setError(null); m.mutate(); }} className="space-y-4">
          <Field label="Код из письма директору" htmlFor="pa-code" error={error ?? undefined} hint="8 символов">
            <Input id="pa-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoComplete="one-time-code" maxLength={12} className="h-11 text-center font-mono text-lg tracking-[0.3em]" autoFocus aria-invalid={Boolean(error)} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Отмена</Button>
            <Button type="submit" loading={m.isPending} disabled={code.replace(/\s/g, '').length < 8}>Подтвердить</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
