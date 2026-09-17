import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, KeyRound, Mail, MailCheck, Trash2 } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { usersApi } from '@/api/endpoints';
import type { EmailChallenge } from '@/api/types';
import { useAuth, useUser } from '@/auth/AuthProvider';
import { useStepUp } from '@/auth/StepUpProvider';
import { PageHeader } from '@/components/app';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Avatar } from '@/layout/AppShell';
import { formatDate } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import { ROLE_LABELS } from '@/lib/labels';

const profileSchema = z.object({
  fullName: z.string().trim().min(1, 'Укажите ФИО').max(200),
  phone: z.union([z.literal(''), z.string().trim().regex(/^\+?[0-9 ()-]{5,32}$/, 'Цифры, пробелы, + ( ) -')]),
});

export default function ProfilePage() {
  const me = useUser();
  const { setUser } = useAuth();
  const qc = useQueryClient();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [emailOpen, setEmailOpen] = React.useState(false);
  const [passwordOpen, setPasswordOpen] = React.useState(false);

  const form = useForm<z.infer<typeof profileSchema>>({ resolver: zodResolver(profileSchema), defaultValues: { fullName: me.fullName, phone: me.phone ?? '' } });
  const save = useMutation({
    mutationFn: (v: z.infer<typeof profileSchema>) => usersApi.updateProfile({ fullName: v.fullName, phone: v.phone || null }),
    onSuccess: (u) => { setUser(u); form.reset({ fullName: u.fullName, phone: u.phone ?? '' }); toast.success('Профиль сохранён'); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const avatar = useMutation({
    mutationFn: (file: File) => usersApi.uploadAvatar(file),
    onSuccess: (u) => { setUser(u); void qc.invalidateQueries({ queryKey: ['avatar', u.id] }); toast.success('Фото обновлено'); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const removeAvatar = useMutation({
    mutationFn: usersApi.deleteAvatar,
    onSuccess: () => { setUser({ ...me, avatarUrl: null }); toast.success('Фото удалено'); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const e = form.formState.errors;

  return (
    <>
      <PageHeader title="Профиль" description="Роль и дату создания меняет только администрация." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="h-fit">
          <CardContent className="flex flex-col items-center gap-3 text-center">
            <Avatar user={me} size={96} />
            <div>
              <p className="font-semibold">{me.fullName}</p>
              <p className="text-sm text-muted-foreground">{ROLE_LABELS[me.role]}</p>
              <p className="mt-1 font-mono text-xs text-muted-foreground">{me.username} · с {formatDate(me.createdAt)}</p>
            </div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Фото профиля" onChange={(ev) => { const f = ev.target.files?.[0]; if (f) avatar.mutate(f); ev.target.value = ''; }} />
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} loading={avatar.isPending}><Camera /> {me.avatarUrl ? 'Сменить фото' : 'Загрузить фото'}</Button>
              {me.avatarUrl && <Button variant="ghost" size="icon" className="size-8 text-destructive" aria-label="Удалить фото" onClick={() => removeAvatar.mutate()}><Trash2 /></Button>}
            </div>
            <p className="text-xs text-muted-foreground">JPEG, PNG или WebP, до 10 МБ</p>
          </CardContent>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader><div><CardTitle>Личные данные</CardTitle><CardDescription>Хранятся в зашифрованном виде</CardDescription></div></CardHeader>
            <CardContent>
              <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="grid gap-4 sm:grid-cols-2" noValidate>
                <Field label="ФИО" htmlFor="pf-name" required error={e.fullName?.message} className="sm:col-span-2"><Input id="pf-name" autoComplete="name" {...form.register('fullName')} /></Field>
                <Field label="Телефон" htmlFor="pf-phone" error={e.phone?.message}><Input id="pf-phone" type="tel" inputMode="tel" autoComplete="tel" {...form.register('phone')} /></Field>
                <div className="flex items-end justify-end sm:col-span-2">
                  <Button type="submit" loading={save.isPending} disabled={!form.formState.isDirty}>Сохранить</Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><div><CardTitle>Безопасность</CardTitle><CardDescription>Изменения подтверждаются кодом из письма</CardDescription></div></CardHeader>
            <CardContent className="divide-y p-0">
              <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex items-start gap-3">
                  <Mail className="mt-0.5 size-5 text-muted-foreground" aria-hidden />
                  <div>
                    <p className="text-sm font-medium">{me.email ?? 'Email не указан'}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      {me.emailVerified ? <><MailCheck className="size-3.5 text-success" aria-hidden />Подтверждён</> : 'Не подтверждён'} · сюда приходят коды входа
                    </p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => setEmailOpen(true)}>Сменить email</Button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex items-start gap-3">
                  <KeyRound className="mt-0.5 size-5 text-muted-foreground" aria-hidden />
                  <div><p className="text-sm font-medium">Пароль</p><p className="mt-0.5 text-xs text-muted-foreground">После смены все сеансы завершатся</p></div>
                </div>
                <Button variant="outline" size="sm" onClick={() => setPasswordOpen(true)}>Сменить пароль</Button>
              </div>
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground">Статус: <Badge tone={me.status === 'active' ? 'success' : 'neutral'}>{me.status === 'active' ? 'Активен' : 'Отключён'}</Badge></p>
        </div>
      </div>
      {emailOpen && <ChangeEmailDialog onClose={() => setEmailOpen(false)} />}
      {passwordOpen && <ChangePasswordDialog onClose={() => setPasswordOpen(false)} />}
    </>
  );
}

function ChangeEmailDialog({ onClose }: { onClose: () => void }) {
  const stepUp = useStepUp();
  const { setUser } = useAuth();
  const [email, setEmail] = React.useState('');
  const [challenge, setChallenge] = React.useState<EmailChallenge | null>(null);
  const [code, setCode] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const start = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!z.string().email().safeParse(email.trim()).success) return setError('Введите корректный email');
    setError(null);
    setBusy(true);
    await stepUp({ action: 'user.email.change', title: `Смена email на ${email.trim()} (шаг 1 из 2: код на текущий адрес)`, run: (h) => usersApi.startEmailChange(email.trim(), h) })
      .then((c) => setChallenge(c))
      .catch(() => undefined)
      .finally(() => setBusy(false));
  };
  const confirm = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!challenge) return;
    setBusy(true);
    setError(null);
    try {
      const u = await usersApi.confirmEmailChange(challenge.challengeId, code.replace(/\s/g, '').toUpperCase());
      setUser(u);
      toast.success('Email изменён. На старый адрес отправлено уведомление.');
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="sm" title="Смена email" description={challenge ? `Шаг 2 из 2: код отправлен на ${challenge.emailHint}` : 'Шаг 1 из 2: подтвердите смену кодом с текущего адреса.'}>
        {challenge ? (
          <form onSubmit={confirm} className="space-y-4">
            <Field label="Код с нового адреса" htmlFor="ce-code" error={error ?? undefined}>
              <Input id="ce-code" value={code} onChange={(ev) => setCode(ev.target.value.toUpperCase())} autoComplete="one-time-code" maxLength={12} className="h-11 text-center font-mono text-lg tracking-[0.3em]" autoFocus />
            </Field>
            <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Отмена</Button><Button type="submit" loading={busy}>Подтвердить</Button></DialogFooter>
          </form>
        ) : (
          <form onSubmit={start} className="space-y-4" noValidate>
            <Field label="Новый email" htmlFor="ce-email" required error={error ?? undefined} hint="Должен быть рабочим — на него будут приходить коды входа">
              <Input id="ce-email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(ev) => setEmail(ev.target.value)} autoFocus />
            </Field>
            <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Отмена</Button><Button type="submit" loading={busy}>Продолжить</Button></DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

const passwordSchema = z
  .object({ current: z.string().min(1, 'Введите текущий пароль'), next: z.string().min(12, 'Не короче 12 символов').max(256), repeat: z.string() })
  .refine((v) => v.next === v.repeat, { path: ['repeat'], message: 'Пароли не совпадают' })
  .refine((v) => v.next !== v.current, { path: ['next'], message: 'Новый пароль совпадает с текущим' });

function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const stepUp = useStepUp();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = React.useState(false);
  const form = useForm<z.infer<typeof passwordSchema>>({ resolver: zodResolver(passwordSchema), defaultValues: { current: '', next: '', repeat: '' } });
  const e = form.formState.errors;
  const submit = form.handleSubmit(async (v) => {
    setBusy(true);
    await stepUp({ action: 'user.password.change', title: 'Смена пароля', run: (h) => usersApi.changePassword(v.current, v.next, h) })
      .then(async () => {
        toast.success('Пароль изменён. Войдите с новым паролем.');
        await logout();
        navigate('/login');
      })
      .catch(() => undefined)
      .finally(() => setBusy(false));
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="sm" title="Смена пароля" description="Все сеансы, включая этот, будут завершены.">
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Текущий пароль" htmlFor="cp-current" required error={e.current?.message}><Input id="cp-current" type="password" autoComplete="current-password" {...form.register('current')} /></Field>
          <Field label="Новый пароль" htmlFor="cp-next" required error={e.next?.message} hint="Не короче 12 символов"><Input id="cp-next" type="password" autoComplete="new-password" {...form.register('next')} /></Field>
          <Field label="Повторите новый пароль" htmlFor="cp-repeat" required error={e.repeat?.message}><Input id="cp-repeat" type="password" autoComplete="new-password" {...form.register('repeat')} /></Field>
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Отмена</Button><Button type="submit" loading={busy}>Сменить пароль</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
