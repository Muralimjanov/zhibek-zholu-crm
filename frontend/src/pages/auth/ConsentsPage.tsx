import { useQuery } from '@tanstack/react-query';
import { FileText, ShieldCheck } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { legalApi } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthProvider';
import { ErrorState } from '@/components/app';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/misc';
import { errorMessage } from '@/lib/errors';
import { LEGAL_TITLES } from '@/lib/labels';

/** Business sections stay locked (403 CONSENT_REQUIRED) until every required document is accepted. */
export function ConsentsPage() {
  const { refreshConsents, logout, user } = useAuth();
  const status = useQuery({ queryKey: ['consents', 'status'], queryFn: legalApi.consentStatus });
  const [checked, setChecked] = React.useState<Record<string, boolean>>({});
  const [saving, setSaving] = React.useState(false);

  const pendingDocs = status.data?.required.filter((r) => !r.accepted) ?? [];
  const allChecked = pendingDocs.length > 0 && pendingDocs.every((d) => checked[d.policyType]);

  const accept = async () => {
    setSaving(true);
    try {
      for (const d of pendingDocs) await legalApi.accept(d.policyType, d.currentVersion);
      await refreshConsents();
      toast.success('Спасибо! Доступ открыт.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-lg p-6 sm:p-8">
        <div className="mb-5 grid size-12 place-items-center rounded-xl bg-primary-soft text-primary">
          <ShieldCheck className="size-6" aria-hidden />
        </div>
        <h1 className="text-xl font-semibold">Добро пожаловать{user ? `, ${firstName(user.fullName)}` : ''}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Перед началом работы ознакомьтесь с документами и подтвердите согласие.</p>
        {status.isLoading ? (
          <div className="mt-6 space-y-3">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}
          </div>
        ) : status.isError ? (
          <ErrorState error={status.error} onRetry={() => status.refetch()} />
        ) : (
          <ul className="mt-6 space-y-2">
            {pendingDocs.map((d) => (
              <li key={d.policyType} className="flex items-start gap-3 rounded-md border p-3">
                <Checkbox id={`c-${d.policyType}`} checked={Boolean(checked[d.policyType])} onChange={(e) => setChecked((c) => ({ ...c, [d.policyType]: e.target.checked }))} />
                <div className="min-w-0 flex-1">
                  <label htmlFor={`c-${d.policyType}`} className="text-sm font-medium">
                    Я ознакомлен(а) и принимаю: {LEGAL_TITLES[d.policyType] ?? d.policyType}
                  </label>
                  <Link to={`/legal/${d.policyType}`} target="_blank" className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    <FileText className="size-3.5" aria-hidden /> Открыть документ · версия {d.currentVersion}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button variant="ghost" onClick={() => void logout()}>Выйти</Button>
          <Button onClick={accept} disabled={!allChecked} loading={saving}>Принять и продолжить</Button>
        </div>
      </Card>
    </div>
  );
}

/** "Фамилия Имя Отчество" -> "Имя"; a single word is returned as is. */
function firstName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts.length >= 2 ? parts[1] : parts[0];
}
