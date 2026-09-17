import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Eye, EyeOff, KeyRound, LockKeyhole, MailCheck } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { z } from 'zod';
import { authApi } from '@/api/endpoints';
import type { LoginChallenge } from '@/api/types';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { ApiError, errorMessage } from '@/lib/errors';

const credentialsSchema = z.object({
  username: z.string().trim().min(1, 'Введите логин'),
  password: z.string().min(1, 'Введите пароль'),
});

function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-sidebar p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 opacity-[0.07]" aria-hidden style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '22px 22px' }} />
        <div className="relative flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-white/10 font-mono text-sm font-bold">УЖЖ</div>
          <div>
            <p className="font-semibold">Улуу Жибек Жолу</p>
            <p className="text-sm text-sidebar-muted">ОсОО «Ош Жибек Жолу»</p>
          </div>
        </div>
        <div className="relative max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">Продажи, смены, зарплата и финансы — в одной системе</h2>
          <ul className="mt-6 space-y-3 text-sm text-sidebar-foreground/90">
            <li className="flex gap-3"><LockKeyhole className="size-5 shrink-0 text-teal-300" aria-hidden />Персональные данные покупателей хранятся зашифрованными</li>
            <li className="flex gap-3"><MailCheck className="size-5 shrink-0 text-teal-300" aria-hidden />Вход и важные действия подтверждаются кодом из письма</li>
            <li className="flex gap-3"><KeyRound className="size-5 shrink-0 text-teal-300" aria-hidden />Каждый сотрудник видит только свои разделы</li>
          </ul>
        </div>
        <p className="relative text-xs text-sidebar-muted">Внутренняя система. Доступ только для сотрудников компании.</p>
      </div>
      <div className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { completeLogin } = useAuth();
  const [challenge, setChallenge] = React.useState<LoginChallenge | null>(null);
  const [credentials, setCredentials] = React.useState<z.infer<typeof credentialsSchema> | null>(null);
  const [showPassword, setShowPassword] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [code, setCode] = React.useState('');
  const [verifying, setVerifying] = React.useState(false);
  const [resendIn, setResendIn] = React.useState(0);
  const codeRef = React.useRef<HTMLInputElement>(null);

  const form = useForm<z.infer<typeof credentialsSchema>>({ resolver: zodResolver(credentialsSchema), defaultValues: { username: '', password: '' } });

  React.useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const requestCode = async (values: z.infer<typeof credentialsSchema>) => {
    setFormError(null);
    try {
      const c = await authApi.login(values.username, values.password);
      setCredentials(values);
      setChallenge(c);
      setCode('');
      setResendIn(60);
      setTimeout(() => codeRef.current?.focus(), 50);
    } catch (err) {
      setFormError(errorMessage(err));
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challenge) return;
    const clean = code.replace(/\s/g, '').toUpperCase();
    if (clean.length !== 8) return setFormError('Код состоит из 8 символов.');
    setVerifying(true);
    setFormError(null);
    try {
      const session = await authApi.verify(challenge.challengeId, clean);
      form.reset();
      await completeLogin(session);
    } catch (err) {
      setFormError(errorMessage(err));
      if (err instanceof ApiError && err.code === 'EMAIL_CODE_INVALID') codeRef.current?.select();
    } finally {
      setVerifying(false);
    }
  };

  if (challenge) {
    return (
      <AuthLayout>
        <button type="button" onClick={() => { setChallenge(null); setFormError(null); }} className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> Назад
        </button>
        <div className="mb-6 grid size-12 place-items-center rounded-xl bg-primary-soft text-primary">
          <MailCheck className="size-6" aria-hidden />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Проверьте почту</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Мы отправили код входа на <span className="font-medium text-foreground">{challenge.emailHint}</span>. Если письма нет — проверьте папку «Спам».
        </p>
        <form onSubmit={verify} className="mt-6 space-y-4" noValidate>
          <Field label="Код из письма" htmlFor="login-code" error={formError ?? undefined} hint="8 символов, действует 10 минут">
            <Input
              ref={codeRef}
              id="login-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              autoComplete="one-time-code"
              maxLength={12}
              className="h-12 text-center font-mono text-xl tracking-[0.35em]"
              aria-invalid={Boolean(formError)}
            />
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={verifying}>
            Войти
          </Button>
          <Button type="button" variant="ghost" className="w-full" disabled={resendIn > 0 || !credentials} onClick={() => credentials && requestCode(credentials)}>
            {resendIn > 0 ? `Отправить код повторно через ${resendIn} с` : 'Отправить код повторно'}
          </Button>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <h1 className="text-2xl font-semibold tracking-tight">Вход в CRM</h1>
      <p className="mt-2 text-sm text-muted-foreground">Введите логин и пароль, выданные компанией.</p>
      <form onSubmit={form.handleSubmit(requestCode)} className="mt-6 space-y-4" noValidate>
        {formError && (
          <div role="alert" className="rounded-md border border-destructive/30 bg-destructive-soft px-3 py-2 text-sm text-destructive">
            {formError}
          </div>
        )}
        <Field label="Логин" htmlFor="username" error={form.formState.errors.username?.message}>
          <Input id="username" autoComplete="username" autoCapitalize="none" spellCheck={false} className="h-11" aria-invalid={Boolean(form.formState.errors.username)} {...form.register('username')} />
        </Field>
        <Field label="Пароль" htmlFor="password" error={form.formState.errors.password?.message}>
          <div className="relative">
            <Input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" className="h-11 pr-11" aria-invalid={Boolean(form.formState.errors.password)} {...form.register('password')} />
            <button type="button" onClick={() => setShowPassword((s) => !s)} className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted-foreground hover:text-foreground" aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}>
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
          Получить код
        </Button>
      </form>
      <p className="mt-8 text-xs text-muted-foreground">
        Входя, вы соглашаетесь с{' '}
        <Link to="/legal/terms_of_use" className="text-primary underline-offset-4 hover:underline">условиями использования</Link> и{' '}
        <Link to="/legal/privacy_policy" className="text-primary underline-offset-4 hover:underline">политикой конфиденциальности</Link>.
      </p>
    </AuthLayout>
  );
}
