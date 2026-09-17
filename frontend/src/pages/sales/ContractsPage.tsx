import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Paperclip, Plus, Search, X } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { contractsApi } from '@/api/endpoints';
import { hasBuyer, type ContractStatus } from '@/api/types';
import { useUser } from '@/auth/AuthProvider';
import { EmptyState, ErrorState, Money, PageHeader, Pagination, TableSkeleton } from '@/components/app';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useUsers } from '@/hooks/useUsers';
import { formatDate } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import { CONTRACT_STATUS } from '@/lib/labels';
import { formatArea, formatPercent, somToTyiyn } from '@/lib/money';
import { BuyerFields, ConsentField, ManagerSelect, areaField, buyerSchema, dec, percentField, somField, useBuyerConsentVersion } from './shared';

const LIMIT = 25;

export default function ContractsPage() {
  const me = useUser();
  const navigate = useNavigate();
  const { nameOf } = useUsers();
  const isAccountant = me.role === 'accountant';
  const [status, setStatus] = React.useState<'all' | ContractStatus>('all');
  const [search, setSearch] = React.useState({ by: 'phone' as 'phone' | 'passportNumber', value: '' });
  const [applied, setApplied] = React.useState<{ phone?: string; passportNumber?: string }>({});
  const [offset, setOffset] = React.useState(0);
  const [createOpen, setCreateOpen] = React.useState(false);

  const params = { status: status === 'all' ? undefined : status, ...applied, limit: LIMIT, offset };
  const q = useQuery({ queryKey: ['contracts', params], queryFn: () => contractsApi.list(params) });

  return (
    <>
      <PageHeader
        title={me.role === 'sales_manager' ? 'Мои договоры' : 'Договоры'}
        description={isAccountant ? 'Финансовые данные договоров для учёта взносов. Персональные данные покупателей скрыты.' : 'Сумма и взнос рассчитываются автоматически из площади и цены за м².'}
        actions={!isAccountant && <Button onClick={() => setCreateOpen(true)}><Plus /> Новый договор</Button>}
      />
      <Card>
        <div className="flex flex-col gap-3 border-b p-3 xl:flex-row xl:items-center xl:justify-between">
          <Tabs value={status} onValueChange={(v) => { setStatus(v as typeof status); setOffset(0); }}>
            <TabsList aria-label="Статус">
              <TabsTrigger value="all">Все</TabsTrigger>
              <TabsTrigger value="draft">Черновики</TabsTrigger>
              <TabsTrigger value="deposit_paid">Взнос внесён</TabsTrigger>
              <TabsTrigger value="signed">Подписаны</TabsTrigger>
            </TabsList>
          </Tabs>
          {!isAccountant && (
            <form onSubmit={(e) => { e.preventDefault(); setOffset(0); setApplied(search.value.trim() ? { [search.by]: search.value.trim() } : {}); }} className="flex flex-wrap items-center gap-2" role="search">
              <select aria-label="Искать по" value={search.by} onChange={(e) => setSearch((s) => ({ ...s, by: e.target.value as 'phone' | 'passportNumber' }))} className="h-9 rounded-md border border-input bg-card px-2 text-sm">
                <option value="phone">Телефону</option>
                <option value="passportNumber">Паспорту</option>
              </select>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input aria-label="Точный поиск" value={search.value} onChange={(e) => setSearch((s) => ({ ...s, value: e.target.value }))} className="w-52 pl-8" />
              </div>
              <Button type="submit" variant="outline">Найти</Button>
              {(applied.phone || applied.passportNumber) && <Button type="button" variant="ghost" size="icon" aria-label="Сбросить поиск" onClick={() => { setApplied({}); setSearch((s) => ({ ...s, value: '' })); }}><X /></Button>}
            </form>
          )}
        </div>
        {q.isLoading ? (
          <TableSkeleton cols={7} />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : q.data?.items.length === 0 ? (
          <EmptyState title="Договоров нет" description={isAccountant ? 'Договоры появятся, когда менеджеры их оформят.' : 'Оформите договор из брони или создайте напрямую.'} />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>{isAccountant ? 'Договор' : 'Покупатель'}</TH>
                <TH className="text-right">Площадь</TH>
                <TH className="text-right">Сумма</TH>
                <TH className="text-right">Взнос</TH>
                <TH>Статус</TH>
                {me.role !== 'sales_manager' && !isAccountant && <TH>Менеджер</TH>}
                <TH>Создан</TH>
              </TR>
            </THead>
            <TBody>
              {q.data?.items.map((c) => (
                <TR key={c.id} className="cursor-pointer" onClick={() => navigate(`/contracts/${c.id}`)}>
                  <TD className="min-w-52">
                    {hasBuyer(c) ? (
                      <>
                        <a href={`/contracts/${c.id}`} onClick={(e) => e.preventDefault()} className="font-medium hover:underline">{c.fullName}</a>
                        <p className="font-mono text-xs text-muted-foreground">{c.passportNumber}</p>
                      </>
                    ) : (
                      <span className="font-mono text-xs">№ {c.id.slice(0, 8)}</span>
                    )}
                  </TD>
                  <TD className="tabular text-right">{formatArea(c.areaSqm)}</TD>
                  <TD className="text-right"><Money tyiyn={c.totalAmountTyiyn} /></TD>
                  <TD className="text-right">
                    <Money tyiyn={c.depositAmountTyiyn} />
                    <p className="text-xs text-muted-foreground">{formatPercent(c.depositPercent)} · {c.depositPaid ? 'внесён' : 'не внесён'}</p>
                  </TD>
                  <TD>
                    <div className="flex items-center gap-1.5">
                      <Badge tone={CONTRACT_STATUS[c.status].tone}>{CONTRACT_STATUS[c.status].label}</Badge>
                      {c.hasFile && <Paperclip className="size-3.5 text-muted-foreground" aria-label="Файл договора загружен" />}
                    </div>
                  </TD>
                  {me.role !== 'sales_manager' && !isAccountant && <TD className="whitespace-nowrap">{nameOf(c.managerId)}</TD>}
                  <TD className="whitespace-nowrap text-muted-foreground">{formatDate(c.createdAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        {q.data && <Pagination total={q.data.total} limit={LIMIT} offset={offset} onChange={setOffset} />}
      </Card>
      {!isAccountant && <CreateContractDialog open={createOpen} onOpenChange={setCreateOpen} />}
    </>
  );
}

const schema = z.object({
  ...buyerSchema,
  address: z.string().trim().min(1, 'Укажите адрес').max(500),
  areaSqm: areaField,
  priceSom: somField,
  depositPercent: percentField,
  managerId: z.string().optional(),
  consent: z.boolean().refine((v) => v, 'Без подписанного согласия данные вносить нельзя'),
});

function CreateContractDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const me = useUser();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const version = useBuyerConsentVersion();
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema.refine((v) => me.role !== 'director' || Boolean(v.managerId), { path: ['managerId'], message: 'Выберите менеджера' })),
    defaultValues: { fullName: '', passportNumber: '', phone: '', email: '', address: '', areaSqm: '', priceSom: '', depositPercent: '30', managerId: '', consent: false },
  });
  const m = useMutation({
    mutationFn: (v: z.infer<typeof schema>) =>
      contractsApi.create({
        fullName: v.fullName,
        passportNumber: v.passportNumber,
        phone: v.phone,
        email: v.email || undefined,
        address: v.address,
        areaSqm: dec(v.areaSqm),
        pricePerSqmTyiyn: somToTyiyn(v.priceSom)!,
        depositPercent: dec(v.depositPercent),
        managerId: v.managerId || undefined,
        buyerConsentConfirmed: true,
        buyerConsentVersion: version ?? '',
      }),
    onSuccess: (c) => {
      toast.success('Договор создан');
      void qc.invalidateQueries({ queryKey: ['contracts'] });
      form.reset();
      onOpenChange(false);
      navigate(`/contracts/${c.id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const e = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" title="Новый договор" description="Покупатель без брони. Сумма и взнос будут рассчитаны сервером.">
        <form onSubmit={form.handleSubmit((v) => m.mutate(v))} className="space-y-4" noValidate>
          <BuyerFields register={form.register} errors={e} prefix="nc" />
          <Field label="Адрес покупателя" htmlFor="nc-address" required error={e.address?.message}>
            <Input id="nc-address" {...form.register('address')} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Площадь, м²" htmlFor="nc-area" required error={e.areaSqm?.message}><Input id="nc-area" inputMode="decimal" {...form.register('areaSqm')} /></Field>
            <Field label="Цена за м², сом" htmlFor="nc-price" required error={e.priceSom?.message}><Input id="nc-price" inputMode="decimal" {...form.register('priceSom')} /></Field>
            <Field label="Взнос, %" htmlFor="nc-percent" required error={e.depositPercent?.message}><Input id="nc-percent" inputMode="decimal" {...form.register('depositPercent')} /></Field>
          </div>
          <ManagerSelect register={form.register} error={e.managerId?.message} id="nc-manager" />
          <ConsentField register={form.register} error={e.consent?.message} version={version} id="nc-consent" />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
            <Button type="submit" loading={m.isPending} disabled={!version}>Создать договор</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
