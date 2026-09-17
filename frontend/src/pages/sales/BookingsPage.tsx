import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, FileSignature, MoreHorizontal, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { bookingsApi } from '@/api/endpoints';
import type { Booking, BookingStatus } from '@/api/types';
import { useUser } from '@/auth/AuthProvider';
import { useStepUp } from '@/auth/StepUpProvider';
import { DescriptionList, EmptyState, ErrorState, Money, PageHeader, Pagination, TableSkeleton } from '@/components/app';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog, Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, Tabs, TabsList, TabsTrigger } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useUsers } from '@/hooks/useUsers';
import { formatDate } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import { BOOKING_STATUS } from '@/lib/labels';
import { formatArea, formatPercent, somToTyiyn } from '@/lib/money';
import { BuyerFields, ConsentField, ManagerSelect, areaField, buyerSchema, dec, percentField, somField, useBuyerConsentVersion } from './shared';

const LIMIT = 25;

export default function BookingsPage() {
  const me = useUser();
  const { nameOf } = useUsers();
  const [status, setStatus] = React.useState<'all' | BookingStatus>('active');
  const [search, setSearch] = React.useState({ by: 'phone' as 'phone' | 'passportNumber', value: '' });
  const [applied, setApplied] = React.useState<{ phone?: string; passportNumber?: string }>({});
  const [offset, setOffset] = React.useState(0);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<{ booking: Booking; mode: 'view' | 'edit' | 'convert' } | null>(null);

  const params = { status: status === 'all' ? undefined : status, ...applied, limit: LIMIT, offset };
  const q = useQuery({ queryKey: ['bookings', params], queryFn: () => bookingsApi.list(params) });
  const canDelete = me.role === 'director' || me.role === 'head_of_sales';

  const applySearch = (e: React.FormEvent) => {
    e.preventDefault();
    setOffset(0);
    setApplied(search.value.trim() ? { [search.by]: search.value.trim() } : {});
  };

  return (
    <>
      <PageHeader
        title={me.role === 'sales_manager' ? 'Мои бронирования' : 'Бронирования'}
        description="Покупатели, зарезервировавшие площадь до оформления документов."
        actions={<Button onClick={() => setCreateOpen(true)}><Plus /> Новая бронь</Button>}
      />
      <Card>
        <div className="flex flex-col gap-3 border-b p-3 xl:flex-row xl:items-center xl:justify-between">
          <Tabs value={status} onValueChange={(v) => { setStatus(v as typeof status); setOffset(0); }}>
            <TabsList aria-label="Статус">
              <TabsTrigger value="active">Активные</TabsTrigger>
              <TabsTrigger value="converted">С договором</TabsTrigger>
              <TabsTrigger value="cancelled">Отменённые</TabsTrigger>
              <TabsTrigger value="all">Все</TabsTrigger>
            </TabsList>
          </Tabs>
          <form onSubmit={applySearch} className="flex flex-wrap items-center gap-2" role="search">
            <select aria-label="Искать по" value={search.by} onChange={(e) => setSearch((s) => ({ ...s, by: e.target.value as 'phone' | 'passportNumber' }))} className="h-9 rounded-md border border-input bg-card px-2 text-sm">
              <option value="phone">Телефону</option>
              <option value="passportNumber">Паспорту</option>
            </select>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input aria-label="Точный поиск" placeholder={search.by === 'phone' ? '0555 123 456' : 'AN1234567'} value={search.value} onChange={(e) => setSearch((s) => ({ ...s, value: e.target.value }))} className="w-52 pl-8" />
            </div>
            <Button type="submit" variant="outline">Найти</Button>
            {(applied.phone || applied.passportNumber) && (
              <Button type="button" variant="ghost" size="icon" aria-label="Сбросить поиск" onClick={() => { setApplied({}); setSearch((s) => ({ ...s, value: '' })); }}><X /></Button>
            )}
          </form>
        </div>
        {q.isLoading ? (
          <TableSkeleton cols={6} />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : q.data?.items.length === 0 ? (
          <EmptyState title={applied.phone || applied.passportNumber ? 'Ничего не найдено' : 'Броней нет'} description={applied.phone || applied.passportNumber ? 'Поиск ищет точное совпадение номера.' : 'Создайте первую бронь для покупателя.'} action={!applied.phone && !applied.passportNumber && <Button variant="outline" onClick={() => setCreateOpen(true)}><Plus /> Новая бронь</Button>} />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Покупатель</TH>
                <TH>Телефон</TH>
                <TH className="text-right">Площадь</TH>
                <TH>Статус</TH>
                {me.role !== 'sales_manager' && <TH>Менеджер</TH>}
                <TH>Создана</TH>
                <TH className="w-12"><span className="sr-only">Действия</span></TH>
              </TR>
            </THead>
            <TBody>
              {q.data?.items.map((b) => (
                <TR key={b.id} className="cursor-pointer" onClick={() => setSelected({ booking: b, mode: 'view' })}>
                  <TD className="min-w-52">
                    <p className="font-medium">{b.fullName}</p>
                    <p className="font-mono text-xs text-muted-foreground">{b.passportNumber}</p>
                  </TD>
                  <TD className="tabular whitespace-nowrap">{b.phone}</TD>
                  <TD className="tabular text-right">{formatArea(b.desiredAreaSqm)}</TD>
                  <TD><Badge tone={BOOKING_STATUS[b.status].tone}>{BOOKING_STATUS[b.status].label}</Badge></TD>
                  {me.role !== 'sales_manager' && <TD className="whitespace-nowrap">{nameOf(b.managerId)}</TD>}
                  <TD className="whitespace-nowrap text-muted-foreground">{formatDate(b.createdAt)}</TD>
                  <TD onClick={(e) => e.stopPropagation()}>
                    <BookingActions booking={b} canDelete={canDelete} onSelect={(mode) => setSelected({ booking: b, mode })} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        {q.data && <Pagination total={q.data.total} limit={LIMIT} offset={offset} onChange={setOffset} />}
      </Card>

      <CreateBookingDialog open={createOpen} onOpenChange={setCreateOpen} />
      {selected?.mode === 'view' && <BookingDetailDialog id={selected.booking.id} onClose={() => setSelected(null)} onMode={(mode) => setSelected({ ...selected, mode })} />}
      {selected?.mode === 'edit' && <EditBookingDialog booking={selected.booking} onClose={() => setSelected(null)} />}
      {selected?.mode === 'convert' && <ConvertDialog booking={selected.booking} onClose={() => setSelected(null)} />}
    </>
  );
}

function BookingActions({ booking, canDelete, onSelect }: { booking: Booking; canDelete: boolean; onSelect: (mode: 'view' | 'edit' | 'convert') => void }) {
  const qc = useQueryClient();
  const stepUp = useStepUp();
  const [confirm, setConfirm] = React.useState<'cancel' | 'delete' | null>(null);
  const cancel = useMutation({
    mutationFn: () => bookingsApi.update(booking.id, { status: 'cancelled' }),
    onSuccess: () => { toast.success('Бронь отменена'); setConfirm(null); void qc.invalidateQueries({ queryKey: ['bookings'] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = async () => {
    setConfirm(null);
    await stepUp({ action: 'booking.delete', resourceId: booking.id, title: `Удаление брони: ${booking.fullName}`, run: (h) => bookingsApi.remove(booking.id, h) })
      .then(() => { toast.success('Бронь удалена'); void qc.invalidateQueries({ queryKey: ['bookings'] }); })
      .catch(() => undefined);
  };
  const active = booking.status === 'active';
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" aria-label={`Действия: ${booking.fullName}`}><MoreHorizontal /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => onSelect('view')}>Открыть</DropdownMenuItem>
          {active && <DropdownMenuItem onSelect={() => onSelect('convert')}><FileSignature /> Оформить договор</DropdownMenuItem>}
          {booking.status !== 'converted' && <DropdownMenuItem onSelect={() => onSelect('edit')}><Pencil /> Изменить</DropdownMenuItem>}
          {active && <DropdownMenuItem onSelect={() => setConfirm('cancel')}><Ban /> Отменить бронь</DropdownMenuItem>}
          {canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onSelect={() => setConfirm('delete')}><Trash2 /> Удалить</DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog open={confirm === 'cancel'} onOpenChange={(o) => !o && setConfirm(null)} title="Отменить бронь?" description={`Бронь покупателя ${booking.fullName} получит статус «Отменена».`} confirmLabel="Отменить бронь" loading={cancel.isPending} onConfirm={() => cancel.mutate()} />
      <ConfirmDialog open={confirm === 'delete'} onOpenChange={(o) => !o && setConfirm(null)} destructive title="Удалить бронь?" description="Запись и персональные данные покупателя будут удалены без возможности восстановления. Потребуется код из письма." confirmLabel="Удалить" onConfirm={() => void remove()} />
    </>
  );
}

const createSchema = z.object({
  ...buyerSchema,
  desiredAreaSqm: areaField,
  managerId: z.string().optional(),
  consent: z.boolean().refine((v) => v, 'Без подписанного согласия данные вносить нельзя'),
});

function CreateBookingDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const me = useUser();
  const qc = useQueryClient();
  const version = useBuyerConsentVersion();
  const form = useForm<z.infer<typeof createSchema>>({
    resolver: zodResolver(createSchema.refine((v) => me.role !== 'director' || Boolean(v.managerId), { path: ['managerId'], message: 'Выберите менеджера' })),
    defaultValues: { fullName: '', passportNumber: '', phone: '', email: '', desiredAreaSqm: '', managerId: '', consent: false },
  });
  const m = useMutation({
    mutationFn: (v: z.infer<typeof createSchema>) =>
      bookingsApi.create({
        fullName: v.fullName,
        passportNumber: v.passportNumber,
        phone: v.phone,
        email: v.email || undefined,
        desiredAreaSqm: dec(v.desiredAreaSqm),
        managerId: v.managerId || undefined,
        buyerConsentConfirmed: true,
        buyerConsentVersion: version ?? '',
      }),
    onSuccess: () => {
      toast.success('Бронь создана');
      void qc.invalidateQueries({ queryKey: ['bookings'] });
      form.reset();
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const e = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" title="Новая бронь" description="Данные покупателя хранятся в зашифрованном виде.">
        <form onSubmit={form.handleSubmit((v) => m.mutate(v))} className="space-y-4" noValidate>
          <BuyerFields register={form.register} errors={e} prefix="nb" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Желаемая площадь, м²" htmlFor="nb-area" required error={e.desiredAreaSqm?.message}>
              <Input id="nb-area" inputMode="decimal" aria-invalid={Boolean(e.desiredAreaSqm)} {...form.register('desiredAreaSqm')} />
            </Field>
            <ManagerSelect register={form.register} error={e.managerId?.message} id="nb-manager" />
          </div>
          <ConsentField register={form.register} error={e.consent?.message} version={version} id="nb-consent" />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
            <Button type="submit" loading={m.isPending} disabled={!version}>Создать бронь</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BookingDetailDialog({ id, onClose, onMode }: { id: string; onClose: () => void; onMode: (m: 'edit' | 'convert') => void }) {
  const q = useQuery({ queryKey: ['booking', id], queryFn: () => bookingsApi.get(id) });
  const { nameOf } = useUsers();
  const navigate = useNavigate();
  const b = q.data;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg" title={b ? b.fullName : 'Бронь'} description="Просмотр полных данных записывается в журнал.">
        {q.isLoading ? <TableSkeleton rows={4} cols={2} /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : b && (
          <>
            <div className="mb-4"><Badge tone={BOOKING_STATUS[b.status].tone}>{BOOKING_STATUS[b.status].label}</Badge></div>
            <DescriptionList
              items={[
                ['Паспорт', <span className="font-mono">{b.passportNumber}</span>],
                ['Телефон', b.phone],
                ['Email', b.email],
                ['Желаемая площадь', formatArea(b.desiredAreaSqm)],
                ['Менеджер', nameOf(b.managerId)],
                ['Согласие покупателя', `Версия ${b.buyerConsentVersion}, ${formatDate(b.buyerConsentConfirmedAt)}`],
                ['Создана', formatDate(b.createdAt)],
                ['Изменена', formatDate(b.updatedAt)],
              ]}
            />
            <DialogFooter>
              {b.contractId && <Button variant="outline" onClick={() => navigate(`/contracts/${b.contractId}`)}><FileSignature /> Открыть договор</Button>}
              {b.status !== 'converted' && <Button variant="outline" onClick={() => onMode('edit')}><Pencil /> Изменить</Button>}
              {b.status === 'active' && <Button onClick={() => onMode('convert')}><FileSignature /> Оформить договор</Button>}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

const editSchema = z.object({ ...buyerSchema, desiredAreaSqm: areaField, managerId: z.string().optional() });

function EditBookingDialog({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const qc = useQueryClient();
  const full = useQuery({ queryKey: ['booking', booking.id], queryFn: () => bookingsApi.get(booking.id) });
  const form = useForm<z.infer<typeof editSchema>>({ resolver: zodResolver(editSchema) });
  React.useEffect(() => {
    if (full.data) form.reset({ fullName: full.data.fullName, passportNumber: full.data.passportNumber, phone: full.data.phone, email: full.data.email ?? '', desiredAreaSqm: full.data.desiredAreaSqm, managerId: '' });
  }, [full.data, form]);
  const m = useMutation({
    mutationFn: (v: z.infer<typeof editSchema>) => {
      const d = full.data!;
      const body: Parameters<typeof bookingsApi.update>[1] = {};
      if (v.fullName !== d.fullName) body.fullName = v.fullName;
      if (v.passportNumber !== d.passportNumber) body.passportNumber = v.passportNumber;
      if (v.phone !== d.phone) body.phone = v.phone;
      if ((v.email || null) !== d.email && v.email) body.email = v.email;
      if (Number(dec(v.desiredAreaSqm)) !== Number(d.desiredAreaSqm)) body.desiredAreaSqm = dec(v.desiredAreaSqm);
      if (v.managerId) body.managerId = v.managerId;
      return bookingsApi.update(booking.id, body);
    },
    onSuccess: () => {
      toast.success('Изменения сохранены');
      void qc.invalidateQueries({ queryKey: ['bookings'] });
      void qc.invalidateQueries({ queryKey: ['booking', booking.id] });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const e = form.formState.errors;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg" title="Изменить бронь">
        {full.isLoading ? <TableSkeleton rows={4} cols={2} /> : (
          <form onSubmit={form.handleSubmit((v) => m.mutate(v))} className="space-y-4" noValidate>
            <BuyerFields register={form.register} errors={e} prefix="eb" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Желаемая площадь, м²" htmlFor="eb-area" required error={e.desiredAreaSqm?.message}>
                <Input id="eb-area" inputMode="decimal" {...form.register('desiredAreaSqm')} />
              </Field>
              <ManagerSelect register={form.register} id="eb-manager" allowEmpty />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Отмена</Button>
              <Button type="submit" loading={m.isPending}>Сохранить</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

const convertSchema = z.object({
  address: z.string().trim().min(1, 'Укажите адрес покупателя').max(500),
  areaSqm: areaField,
  priceSom: somField,
  depositPercent: percentField,
  consent: z.boolean().refine((v) => v, 'Подтвердите согласие покупателя'),
});

function ConvertDialog({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const version = useBuyerConsentVersion();
  const form = useForm<z.infer<typeof convertSchema>>({
    resolver: zodResolver(convertSchema),
    defaultValues: { address: '', areaSqm: booking.desiredAreaSqm, priceSom: '', depositPercent: '30', consent: false },
  });
  const [area, price, percent] = form.watch(['areaSqm', 'priceSom', 'depositPercent']);
  const priceT = somToTyiyn(price ?? '');
  const total = priceT && /^\d+([.,]\d{1,2})?$/.test(area ?? '') ? (BigInt(priceT) * BigInt(Math.round(Number(dec(area)) * 100))) / 100n : null;
  const deposit = total !== null && /^\d+([.,]\d{1,2})?$/.test(percent ?? '') ? (total * BigInt(Math.round(Number(dec(percent)) * 100))) / 10000n : null;

  const m = useMutation({
    mutationFn: (v: z.infer<typeof convertSchema>) =>
      bookingsApi.convert(booking.id, { address: v.address, areaSqm: dec(v.areaSqm), pricePerSqmTyiyn: somToTyiyn(v.priceSom)!, depositPercent: dec(v.depositPercent), buyerConsentConfirmed: true, buyerConsentVersion: version ?? '' }),
    onSuccess: (c) => {
      toast.success('Договор оформлен');
      void qc.invalidateQueries({ queryKey: ['bookings'] });
      void qc.invalidateQueries({ queryKey: ['contracts'] });
      onClose();
      navigate(`/contracts/${c.id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const e = form.formState.errors;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg" title="Оформить договор" description={`Покупатель: ${booking.fullName}. Суммы рассчитываются сервером.`}>
        <form onSubmit={form.handleSubmit((v) => m.mutate(v))} className="space-y-4" noValidate>
          <Field label="Адрес покупателя" htmlFor="cv-address" required error={e.address?.message}>
            <Input id="cv-address" aria-invalid={Boolean(e.address)} {...form.register('address')} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Площадь, м²" htmlFor="cv-area" required error={e.areaSqm?.message}>
              <Input id="cv-area" inputMode="decimal" {...form.register('areaSqm')} />
            </Field>
            <Field label="Цена за м², сом" htmlFor="cv-price" required error={e.priceSom?.message}>
              <Input id="cv-price" inputMode="decimal" {...form.register('priceSom')} />
            </Field>
            <Field label="Взнос, %" htmlFor="cv-percent" required error={e.depositPercent?.message}>
              <Input id="cv-percent" inputMode="decimal" {...form.register('depositPercent')} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3 rounded-md bg-primary-soft p-3 text-sm" aria-live="polite">
            <div><p className="text-xs text-muted-foreground">Сумма договора (предварительно)</p><p className="font-semibold"><Money tyiyn={total?.toString()} /></p></div>
            <div><p className="text-xs text-muted-foreground">Взнос {formatPercent(percent)}</p><p className="font-semibold"><Money tyiyn={deposit?.toString()} /></p></div>
          </div>
          <ConsentField register={form.register} error={e.consent?.message} version={version} id="cv-consent" />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Отмена</Button>
            <Button type="submit" loading={m.isPending} disabled={!version}>Оформить договор</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
