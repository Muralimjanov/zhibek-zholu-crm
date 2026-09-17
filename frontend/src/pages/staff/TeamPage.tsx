import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, MailCheck, MailWarning, Plus, UserX } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { usersApi } from '@/api/endpoints';
import type { User, UserRole } from '@/api/types';
import { useUser } from '@/auth/AuthProvider';
import { EmptyState, ErrorState, PageHeader, TableSkeleton } from '@/components/app';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog, Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Avatar } from '@/layout/AppShell';
import { formatDate } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import { ROLE_LABELS } from '@/lib/labels';

/** Role-creation matrix (backend role-hierarchy.ts). */
const CREATABLE: Partial<Record<UserRole, UserRole[]>> = {
  director: ['head_of_sales', 'accountant', 'investor'],
  head_of_sales: ['sales_manager'],
};

export default function TeamPage() {
  const me = useUser();
  const q = useQuery({ queryKey: ['users'], queryFn: usersApi.list });
  const [createOpen, setCreateOpen] = React.useState(false);
  const [disabling, setDisabling] = React.useState<User | null>(null);
  const qc = useQueryClient();

  const disable = useMutation({
    mutationFn: (u: User) => usersApi.initiateDisable(u.id),
    onSuccess: (r) => {
      setDisabling(null);
      toast.success(me.role === 'director' ? 'Запрос создан — подтвердите его кодом в разделе «Подтверждения»' : 'Запрос отправлен директору на подтверждение', { duration: 6000 });
      if (r.emailDelivery !== 'sent') toast.warning('Письмо директору не отправлено — подтвердить можно в разделе «Подтверждения».');
      void qc.invalidateQueries({ queryKey: ['pending-actions'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const rows = (q.data ?? []).filter((u) => u.id !== me.id).sort((a, b) => Number(a.status === 'disabled') - Number(b.status === 'disabled') || a.fullName.localeCompare(b.fullName, 'ru'));

  return (
    <>
      <PageHeader
        title={me.role === 'head_of_sales' ? 'Моя команда' : 'Сотрудники'}
        description="Создание и отключение аккаунтов вступает в силу только после подтверждения директором кодом из письма."
        actions={<Button onClick={() => setCreateOpen(true)}><Plus /> Новый сотрудник</Button>}
      />
      <Card>
        {q.isLoading ? <TableSkeleton cols={5} /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : rows.length === 0 ? (
          <EmptyState title="Сотрудников пока нет" action={<Button variant="outline" onClick={() => setCreateOpen(true)}><Plus /> Новый сотрудник</Button>} />
        ) : (
          <Table>
            <THead><TR><TH>Сотрудник</TH><TH>Роль</TH><TH>Email</TH><TH>Статус</TH><TH>Создан</TH><TH className="w-12"><span className="sr-only">Действия</span></TH></TR></THead>
            <TBody>
              {rows.map((u) => (
                <TR key={u.id} className={u.status === 'disabled' ? 'opacity-60' : ''}>
                  <TD>
                    <div className="flex items-center gap-2.5">
                      <Avatar user={u} size={32} />
                      <div className="min-w-0"><p className="truncate font-medium">{u.fullName}</p><p className="font-mono text-xs text-muted-foreground">{u.username}</p></div>
                    </div>
                  </TD>
                  <TD className="whitespace-nowrap">{ROLE_LABELS[u.role]}</TD>
                  <TD>
                    <span className="inline-flex items-center gap-1.5">
                      {u.emailVerified ? <MailCheck className="size-4 text-success" aria-label="Email подтверждён" /> : <MailWarning className="size-4 text-warning" aria-label="Email ещё не подтверждён входом" />}
                      <span className="truncate">{u.email ?? '—'}</span>
                    </span>
                  </TD>
                  <TD><Badge tone={u.status === 'active' ? 'success' : 'neutral'}>{u.status === 'active' ? 'Активен' : 'Отключён'}</Badge></TD>
                  <TD className="whitespace-nowrap text-muted-foreground">{formatDate(u.createdAt)}</TD>
                  <TD>
                    {u.status === 'active' && (me.role === 'director' || u.teamLeadId === me.id) && (
                      <Button variant="ghost" size="icon" className="size-8 text-destructive" aria-label={`Отключить ${u.fullName}`} onClick={() => setDisabling(u)}><UserX /></Button>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      {createOpen && <CreateUserDialog onClose={() => setCreateOpen(false)} />}
      <ConfirmDialog
        open={Boolean(disabling)}
        onOpenChange={(o) => !o && setDisabling(null)}
        destructive
        title={`Отключить ${disabling?.fullName ?? ''}?`}
        description="После подтверждения директором сотрудник не сможет войти, все его сессии завершатся. Данные сохранятся."
        confirmLabel="Запросить отключение"
        loading={disable.isPending}
        onConfirm={() => disabling && disable.mutate(disabling)}
      />
    </>
  );
}

const schema = z.object({
  fullName: z.string().trim().min(1, 'Укажите ФИО').max(200),
  username: z.string().trim().min(3, 'Не короче 3 символов').max(64).regex(/^[a-zA-Z0-9._-]+$/, 'Латинские буквы, цифры, точка, _ и -'),
  email: z.string().trim().email('Укажите рабочий email — на него приходят коды входа').max(254),
  phone: z.union([z.literal(''), z.string().trim().regex(/^\+?[0-9 ()-]{5,32}$/, 'Неверный телефон')]),
  role: z.string().min(1, 'Выберите роль'),
  password: z.string().min(12, 'Не короче 12 символов').max(256),
});

function generatePassword(): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789-_!';
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

function CreateUserDialog({ onClose }: { onClose: () => void }) {
  const me = useUser();
  const roles = CREATABLE[me.role] ?? [];
  const [show, setShow] = React.useState(true);
  const [done, setDone] = React.useState<{ username: string; password: string; delivery: string } | null>(null);
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { fullName: '', username: '', email: '', phone: '', role: roles.length === 1 ? roles[0] : '', password: generatePassword() } });
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (v: z.infer<typeof schema>) => usersApi.initiateCreate({ fullName: v.fullName, username: v.username, email: v.email, phone: v.phone || undefined, role: v.role as UserRole, password: v.password }),
    onSuccess: (r, v) => { setDone({ username: v.username, password: v.password, delivery: r.emailDelivery }); void qc.invalidateQueries({ queryKey: ['pending-actions'] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const e = form.formState.errors;

  if (done) {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent size="sm" title="Запрос на создание отправлен">
          <div className="space-y-3 text-sm">
            <p>Аккаунт появится после того, как директор подтвердит запрос кодом из письма{me.role === 'director' ? ' — откройте раздел «Подтверждения»' : ''}.</p>
            {done.delivery !== 'sent' && <p className="rounded-md bg-warning-soft px-3 py-2 text-warning">Письмо директору не отправлено. Подтвердить можно в разделе «Подтверждения».</p>}
            <div className="rounded-md border bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">Передайте сотруднику лично (не в общий чат):</p>
              <p className="mt-2">Логин: <span className="font-mono font-medium">{done.username}</span></p>
              <p>Пароль: <span className="font-mono font-medium">{done.password}</span></p>
              <p className="mt-2 text-xs text-muted-foreground">При входе код придёт на указанный email. Пароль больше нигде не показывается.</p>
            </div>
          </div>
          <DialogFooter>
            {me.role === 'director' && <Button asChild variant="outline"><Link to="/approvals">К подтверждениям</Link></Button>}
            <Button onClick={onClose}>Готово</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg" title="Новый сотрудник" description="Email должен быть настоящим и рабочим: без него сотрудник не сможет войти.">
        <form onSubmit={form.handleSubmit((v) => m.mutate(v))} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="ФИО" htmlFor="nu-name" required error={e.fullName?.message} className="sm:col-span-2"><Input id="nu-name" autoComplete="off" {...form.register('fullName')} /></Field>
            <Field label="Роль" htmlFor="nu-role" required error={e.role?.message}>
              <NativeSelect id="nu-role" {...form.register('role')}>
                {roles.length > 1 && <option value="">Выберите…</option>}
                {roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Логин" htmlFor="nu-username" required error={e.username?.message}><Input id="nu-username" autoComplete="off" autoCapitalize="none" spellCheck={false} {...form.register('username')} /></Field>
            <Field label="Email" htmlFor="nu-email" required error={e.email?.message}><Input id="nu-email" type="email" inputMode="email" autoComplete="off" {...form.register('email')} /></Field>
            <Field label="Телефон" htmlFor="nu-phone" error={e.phone?.message}><Input id="nu-phone" type="tel" inputMode="tel" {...form.register('phone')} /></Field>
            <Field label="Временный пароль" htmlFor="nu-password" required error={e.password?.message} hint="Сгенерирован автоматически. Сотрудник сменит его в профиле." className="sm:col-span-2">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input id="nu-password" type={show ? 'text' : 'password'} autoComplete="new-password" className="pr-10 font-mono" {...form.register('password')} />
                  <button type="button" onClick={() => setShow((s) => !s)} className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-foreground" aria-label={show ? 'Скрыть пароль' : 'Показать пароль'}>{show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
                </div>
                <Button type="button" variant="outline" onClick={() => form.setValue('password', generatePassword(), { shouldValidate: true })}>Новый</Button>
              </div>
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Отмена</Button>
            <Button type="submit" loading={m.isPending}>Отправить на подтверждение</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
