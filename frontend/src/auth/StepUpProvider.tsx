import { MailCheck, ShieldCheck } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import type { CodeHeaders } from '@/api/endpoints';
import { emailCodesApi } from '@/api/endpoints';
import type { EmailCodeAction } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ApiError, errorMessage, isCodeError } from '@/lib/errors';

interface StepUpRequest<T> {
  action: EmailCodeAction;
  resourceId?: string;
  /** What is being confirmed, e.g. "Удаление брони". */
  title: string;
  run: (headers: CodeHeaders) => Promise<T>;
}

type StepUp = <T>(req: StepUpRequest<T>) => Promise<T>;
const StepUpContext = React.createContext<StepUp | null>(null);

interface Pending {
  req: StepUpRequest<unknown>;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
}

/**
 * Important actions need a one-time code emailed to the acting user:
 * request the code, ask for it, then repeat the request with the headers.
 * A request rejected by validation keeps the code valid on the server, so
 * the dialog stays open for a retry with the same code.
 */
export function StepUpProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = React.useState<Pending | null>(null);
  const [challenge, setChallenge] = React.useState<{ id: string; hint: string } | null>(null);
  const [code, setCode] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [needNewCode, setNeedNewCode] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [cooldown, setCooldown] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const sendCode = React.useCallback(async (req: StepUpRequest<unknown>) => {
    setSending(true);
    setError(null);
    setNeedNewCode(false);
    setCode('');
    try {
      const c = await emailCodesApi.request(req.action, req.resourceId);
      setChallenge({ id: c.challengeId, hint: c.emailHint });
      setCooldown(60);
      setTimeout(() => inputRef.current?.focus(), 50);
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setSending(false);
    }
  }, []);

  const stepUp = React.useCallback<StepUp>(
    (req) =>
      new Promise((resolve, reject) => {
        setChallenge(null);
        setPending({ req: req as StepUpRequest<unknown>, resolve: resolve as (v: unknown) => void, reject });
        void sendCode(req as StepUpRequest<unknown>);
      }),
    [sendCode],
  );

  const close = () => {
    pending?.reject(new ApiError(0, 'STEP_UP_CANCELLED'));
    setPending(null);
    setChallenge(null);
    setError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pending || !challenge) return;
    const clean = code.replace(/\s/g, '').toUpperCase();
    if (clean.length !== 8) {
      setError('Код состоит из 8 символов.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await pending.req.run({ 'x-confirmation-id': challenge.id, 'x-confirmation-code': clean });
      pending.resolve(result);
      setPending(null);
      setChallenge(null);
    } catch (err) {
      if (isCodeError(err)) {
        const used = err instanceof ApiError && err.code !== 'EMAIL_CODE_INVALID';
        setNeedNewCode(used);
        setError(errorMessage(err));
        if (!used) inputRef.current?.select();
      } else {
        // Business/validation error: surface it and let the caller fix the form.
        toast.error(errorMessage(err));
        pending.reject(err);
        setPending(null);
        setChallenge(null);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <StepUpContext.Provider value={stepUp}>
      {children}
      <Dialog open={Boolean(pending)} onOpenChange={(o) => !o && close()}>
        {pending && (
          <DialogContent size="sm" title="Подтверждение действия" description={pending.req.title}>
            <form onSubmit={submit} className="space-y-4">
              <div className="flex gap-3 rounded-md bg-primary-soft p-3 text-sm">
                {sending ? (
                  <MailCheck className="mt-0.5 size-4 shrink-0 animate-pulse text-primary" aria-hidden />
                ) : (
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                )}
                <p aria-live="polite">
                  {sending
                    ? 'Отправляем код на вашу почту…'
                    : challenge
                      ? `Мы отправили код на ${challenge.hint}. Введите его, чтобы продолжить.`
                      : 'Код не отправлен.'}
                </p>
              </div>
              <Field label="Код из письма" htmlFor="stepup-code" error={error ?? undefined} hint="8 символов, действует 10 минут">
                <Input
                  ref={inputRef}
                  id="stepup-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  autoComplete="one-time-code"
                  inputMode="text"
                  maxLength={12}
                  className="h-11 text-center font-mono text-lg tracking-[0.3em]"
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? 'stepup-code-error' : 'stepup-code-hint'}
                  disabled={!challenge || sending}
                />
              </Field>
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={sending || cooldown > 0}
                  onClick={() => pending && sendCode(pending.req)}
                  className={needNewCode ? 'text-primary' : ''}
                >
                  {cooldown > 0 ? `Новый код через ${cooldown} с` : 'Отправить новый код'}
                </Button>
                <Button type="submit" loading={submitting} disabled={!challenge || needNewCode}>
                  Подтвердить
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </StepUpContext.Provider>
  );
}

export function useStepUp(): StepUp {
  const ctx = React.useContext(StepUpContext);
  if (!ctx) throw new Error('useStepUp outside StepUpProvider');
  return ctx;
}

export function isCancelled(err: unknown): boolean {
  return err instanceof ApiError && err.code === 'STEP_UP_CANCELLED';
}
