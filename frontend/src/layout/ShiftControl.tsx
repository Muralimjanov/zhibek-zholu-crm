import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Play, Square } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { shiftsApi } from '@/api/endpoints';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { formatTime } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import { REPORT_TYPE } from '@/lib/labels';

/** "Открыть / Завершить смену" (TZ): head of sales, sales manager, accountant. */
export function ShiftControl({ compact = false }: { compact?: boolean }) {
  const qc = useQueryClient();
  const [confirmClose, setConfirmClose] = React.useState(false);
  const current = useQuery({ queryKey: ['shift', 'current'], queryFn: shiftsApi.current, refetchInterval: 60_000 });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['shift'] });
    void qc.invalidateQueries({ queryKey: ['shifts'] });
    void qc.invalidateQueries({ queryKey: ['reports'] });
  };
  const open = useMutation({
    mutationFn: shiftsApi.open,
    onSuccess: () => {
      toast.success('Смена открыта');
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const close = useMutation({
    mutationFn: shiftsApi.close,
    onSuccess: (s) => {
      setConfirmClose(false);
      toast.success(s.reportGenerated ? `Смена завершена. ${REPORT_TYPE[s.reportGenerated]} отчёт отправлен директору и инвесторам.` : 'Смена завершена');
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (current.isLoading) return <div className="h-9 w-36 animate-pulse rounded-md bg-muted" aria-hidden />;
  const shift = current.data;
  const isOpen = shift?.status === 'open';
  const finishedToday = shift && shift.status !== 'open';

  if (finishedToday) {
    return (
      <span className="hidden items-center gap-2 rounded-md bg-muted px-3 py-1.5 text-[13px] text-muted-foreground sm:inline-flex">
        Смена завершена {shift.closedAt ? `в ${formatTime(shift.closedAt)}` : ''}
      </span>
    );
  }

  return (
    <>
      {isOpen ? (
        <Button variant="outline" size={compact ? 'sm' : 'default'} onClick={() => setConfirmClose(true)} className="border-warning/40">
          <span className="relative flex size-2" aria-hidden>
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-success" />
          </span>
          <span className="hidden sm:inline">Смена с {formatTime(shift?.openedAt)}</span>
          <Square className="text-warning" />
          <span>Завершить</span>
        </Button>
      ) : (
        <Button size={compact ? 'sm' : 'default'} onClick={() => open.mutate()} loading={open.isPending}>
          <Play /> Открыть смену
        </Button>
      )}
      <ConfirmDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title="Завершить смену?"
        description="После завершения смену нельзя открыть повторно сегодня. Для начальника продаж и бухгалтера будет сформирован ежедневный отчёт."
        confirmLabel="Завершить смену"
        loading={close.isPending}
        onConfirm={() => close.mutate()}
      />
    </>
  );
}
