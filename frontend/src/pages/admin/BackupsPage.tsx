import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, DatabaseBackup, Download, KeyRound, MonitorDown } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { backupsApi } from '@/api/endpoints';
import { useStepUp } from '@/auth/StepUpProvider';
import { ErrorState, PageHeader, TableSkeleton } from '@/components/app';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateTime } from '@/lib/dates';

export default function BackupsPage() {
  const q = useQuery({ queryKey: ['backups'], queryFn: backupsApi.status });
  const stepUp = useStepUp();
  const qc = useQueryClient();
  const [downloading, setDownloading] = React.useState(false);
  const d = q.data;
  const hoursSince = d?.lastExportAt ? (Date.now() - new Date(d.lastExportAt).getTime()) / 3_600_000 : null;
  const stale = hoursSince === null || (d ? hoursSince > d.reminderAfterHours : false);

  const download = async () => {
    setDownloading(true);
    await stepUp({ action: 'backup.export', title: 'Скачивание полной резервной копии базы', run: (h) => backupsApi.download(h) })
      .then(() => { toast.success('Резервная копия скачана'); void qc.invalidateQueries({ queryKey: ['backups'] }); })
      .catch(() => undefined)
      .finally(() => setDownloading(false));
  };

  return (
    <>
      <PageHeader title="Резервные копии" description="Полная копия базы и файлов, зашифрованная ключом директора. Без закрытого ключа и фразы-пароля её не прочитать." />
      {q.isLoading ? <Card><TableSkeleton rows={4} cols={2} /></Card> : q.isError ? <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card> : d && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>Состояние</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className={`flex gap-3 rounded-md p-3 ${stale ? 'bg-warning-soft' : 'bg-success-soft'}`} role="status">
                {stale ? <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden /> : <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />}
                <div className="text-sm">
                  <p className="font-medium">{d.lastExportAt ? `Последняя копия: ${formatDateTime(d.lastExportAt)}` : 'Копия ещё ни разу не скачивалась'}</p>
                  <p className="text-muted-foreground">
                    {d.lastExportAt ? (d.lastExportChannel === 'agent' ? 'Скачана программой на компьютере директора.' : 'Скачана вручную.') : 'Установите программу резервного копирования или скачайте копию вручную.'}
                    {stale && ` Если копия не скачивается ${d.reminderAfterHours} ч., директорам приходит письмо.`}
                  </p>
                </div>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2">
                <li className="flex items-center justify-between rounded-md border p-3 text-sm"><span className="flex items-center gap-2"><KeyRound className="size-4 text-muted-foreground" aria-hidden />Ключ шифрования</span><Badge tone={d.configured ? 'success' : 'danger'}>{d.configured ? 'Настроен' : 'Не настроен'}</Badge></li>
                <li className="flex items-center justify-between rounded-md border p-3 text-sm"><span className="flex items-center gap-2"><MonitorDown className="size-4 text-muted-foreground" aria-hidden />Программа-агент</span><Badge tone={d.agentConfigured ? 'success' : 'warning'}>{d.agentConfigured ? 'Разрешена' : 'Не настроена'}</Badge></li>
              </ul>
              {d.publicKeySha256 && <p className="break-all text-xs text-muted-foreground">Отпечаток ключа: <span className="font-mono">{d.publicKeySha256}</span></p>}
            </CardContent>
          </Card>
          <Card className="h-fit">
            <CardHeader><CardTitle>Скачать сейчас</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid size-11 place-items-center rounded-lg bg-primary-soft text-primary"><DatabaseBackup className="size-5" aria-hidden /></div>
              <p className="text-sm text-muted-foreground">Файл <span className="font-mono">.uzzbak</span> сохраните на компьютер или флешку. Восстановление описано в инструкции для разработчика.</p>
              <Button className="w-full" onClick={() => void download()} loading={downloading} disabled={!d.configured}><Download /> Скачать копию</Button>
              {!d.configured && <p className="text-xs text-destructive">На сервере не задан BACKUP_PUBLIC_KEY.</p>}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
