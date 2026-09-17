import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Circle, Download, FileUp, HandCoins, Pencil, Trash2 } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { contractsApi } from '@/api/endpoints';
import { hasBuyer, type Contract, type ContractRow } from '@/api/types';
import { useUser } from '@/auth/AuthProvider';
import { useStepUp } from '@/auth/StepUpProvider';
import { DescriptionList, ErrorState, Money, PageHeader, TableSkeleton } from '@/components/app';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog, Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { useUsers } from '@/hooks/useUsers';
import { formatDate, formatDateTime } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import { CONTRACT_STATUS } from '@/lib/labels';
import { formatArea, formatPercent, somToTyiyn, tyiynToSomInput } from '@/lib/money';
import { BuyerFields, ManagerSelect, areaField, buyerSchema, dec, percentField, somField } from './shared';

export default function ContractDetailPage() {
  const { id = '' } = useParams();
  const me = useUser();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const stepUp = useStepUp();
  const { nameOf } = useUsers();
  const q = useQuery({ queryKey: ['contract', id], queryFn: () => contractsApi.get(id) });
  const [editOpen, setEditOpen] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [confirmDeposit, setConfirmDeposit] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const refresh = (c?: ContractRow) => {
    if (c) qc.setQueryData(['contract', id], c);
    void qc.invalidateQueries({ queryKey: ['contracts'] });
    void qc.invalidateQueries({ queryKey: ['contract', id] });
  };

  if (q.isLoading) return <Card><TableSkeleton rows={6} cols={2} /></Card>;
  if (q.isError || !q.data) return <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card>;
  const c = q.data;
  const buyer = hasBuyer(c) ? c : null;
  const isAccountant = me.role === 'accountant';
  const readOnlyForManager = me.role === 'sales_manager' && c.status === 'signed';
  const canEdit = !isAccountant && !readOnlyForManager;
  const canDelete = me.role === 'director' || me.role === 'head_of_sales';
  const canUpload = !isAccountant && !readOnlyForManager;

  const toggleDeposit = async () => {
    setConfirmDeposit(false);
    const paid = !c.depositPaid;
    await stepUp({ action: 'contract.deposit', resourceId: c.id, title: paid ? 'Отметка: взнос внесён' : 'Снятие отметки о взносе', run: (h) => contractsApi.markDeposit(c.id, paid, h) })
      .then((updated) => { toast.success(paid ? 'Взнос отмечен' : 'Отметка о взносе снята'); refresh(updated); })
      .catch(() => undefined);
  };

  const upload = async (file: File) => {
    await stepUp({ action: 'contract.file', resourceId: c.id, title: `Загрузка файла договора: ${file.name}`, run: (h) => contractsApi.uploadFile(c.id, file, h) })
      .then((updated) => { toast.success(updated.status === 'signed' ? 'Файл загружен — договор подписан' : 'Файл загружен'); refresh(updated); })
      .catch(() => undefined);
    if (fileRef.current) fileRef.current.value = '';
  };

  const remove = async () => {
    setConfirmDelete(false);
    await stepUp({ action: 'contract.delete', resourceId: c.id, title: 'Удаление договора', run: (h) => contractsApi.remove(c.id, h) })
      .then(() => { toast.success('Договор удалён'); void qc.invalidateQueries({ queryKey: ['contracts'] }); navigate('/contracts'); })
      .catch(() => undefined);
  };

  const steps = [
    { done: true, label: 'Договор создан', at: formatDate(c.createdAt) },
    { done: c.depositPaid, label: `Взнос ${formatPercent(c.depositPercent)} внесён`, at: c.depositPaidAt ? formatDateTime(c.depositPaidAt) : null },
    { done: c.hasFile, label: 'Подписанный файл загружен', at: null },
  ];

  return (
    <>
      <Link to="/contracts" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden /> Договоры</Link>
      <PageHeader
        title={buyer ? buyer.fullName : `Договор № ${c.id.slice(0, 8)}`}
        description={<span className="inline-flex items-center gap-2"><Badge tone={CONTRACT_STATUS[c.status].tone}>{CONTRACT_STATUS[c.status].label}</Badge>{c.bookingId && 'Оформлен из брони'}</span>}
        actions={
          <>
            {canEdit && <Button variant="outline" onClick={() => setEditOpen(true)}><Pencil /> Изменить</Button>}
            {canDelete && <Button variant="outline" className="text-destructive" onClick={() => setConfirmDelete(true)}><Trash2 /> Удалить</Button>}
          </>
        }
      />
      {readOnlyForManager && <p className="mb-4 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">Договор подписан — изменения доступны только начальнику продаж и директору.</p>}

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardHeader><CardTitle>Условия</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-3">
                <div><p className="text-xs text-muted-foreground">Сумма договора</p><p className="text-xl font-semibold"><Money tyiyn={c.totalAmountTyiyn} /></p></div>
                <div><p className="text-xs text-muted-foreground">Взнос ({formatPercent(c.depositPercent)})</p><p className="text-xl font-semibold"><Money tyiyn={c.depositAmountTyiyn} /></p></div>
                <div><p className="text-xs text-muted-foreground">Площадь × цена за м²</p><p className="tabular text-xl font-semibold">{formatArea(c.areaSqm)}</p><p className="text-xs text-muted-foreground">по <Money tyiyn={c.pricePerSqmTyiyn} /></p></div>
              </div>
            </CardContent>
          </Card>
          {buyer && (
            <Card>
              <CardHeader><CardTitle>Покупатель</CardTitle></CardHeader>
              <CardContent>
                <DescriptionList
                  items={[
                    ['Паспорт', <span className="font-mono">{buyer.passportNumber}</span>],
                    ['Телефон', buyer.phone],
                    ['Email', buyer.email],
                    ['Адрес', buyer.address],
                    ['Менеджер', nameOf(c.managerId)],
                    ['Согласие покупателя', `Версия ${buyer.buyerConsentVersion}, ${formatDate(buyer.buyerConsentConfirmedAt)}`],
                  ]}
                />
              </CardContent>
            </Card>
          )}
        </div>

        <Card className="h-fit">
          <CardHeader><CardTitle>Оформление</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <ol className="space-y-3">
              {steps.map((s) => (
                <li key={s.label} className="flex gap-3">
                  {s.done ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden /> : <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />}
                  <div>
                    <p className={`text-sm ${s.done ? 'font-medium' : 'text-muted-foreground'}`}>{s.label}<span className="sr-only">{s.done ? ' — выполнено' : ' — не выполнено'}</span></p>
                    {s.at && <p className="text-xs text-muted-foreground">{s.at}</p>}
                  </div>
                </li>
              ))}
            </ol>
            <div className="space-y-2">
              {!readOnlyForManager && (
                <Button className="h-auto min-h-9 w-full whitespace-normal py-2" variant={c.depositPaid ? 'outline' : 'default'} onClick={() => (c.depositPaid ? setConfirmDeposit(true) : void toggleDeposit())}>
                  <HandCoins /> {c.depositPaid ? 'Снять отметку о взносе' : 'Отметить взнос внесённым'}
                </Button>
              )}
              {canUpload && (
                <>
                  <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" id="contract-file" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
                  <Button className="h-auto min-h-9 w-full whitespace-normal py-2" variant="outline" onClick={() => fileRef.current?.click()}><FileUp /> {c.hasFile ? 'Заменить файл договора' : 'Загрузить подписанный договор'}</Button>
                  <p className="text-center text-xs text-muted-foreground">PDF, JPEG или PNG, до 10 МБ</p>
                </>
              )}
              {c.hasFile && !isAccountant && (
                <Button className="h-auto min-h-9 w-full whitespace-normal py-2" variant="ghost" onClick={() => contractsApi.downloadFile(c.id).catch((e) => toast.error(errorMessage(e)))}><Download /> Скачать файл договора</Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {editOpen && buyer && <EditContractDialog contract={buyer} onClose={() => setEditOpen(false)} onSaved={refresh} />}
      <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} destructive title="Удалить договор?" description="Договор, данные покупателя и файл будут удалены без возможности восстановления. Потребуется код из письма." confirmLabel="Удалить" onConfirm={() => void remove()} />
      <ConfirmDialog open={confirmDeposit} onOpenChange={setConfirmDeposit} title="Снять отметку о взносе?" description="Статус договора вернётся к «Черновик». Используйте только для исправления ошибки." confirmLabel="Снять отметку" onConfirm={() => void toggleDeposit()} />
    </>
  );
}

const editSchema = z.object({ ...buyerSchema, address: z.string().trim().min(1).max(500), areaSqm: areaField, priceSom: somField, depositPercent: percentField, managerId: z.string().optional() });

function EditContractDialog({ contract: c, onClose, onSaved }: { contract: Contract; onClose: () => void; onSaved: (c: Contract) => void }) {
  const form = useForm<z.infer<typeof editSchema>>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      fullName: c.fullName,
      passportNumber: c.passportNumber,
      phone: c.phone,
      email: c.email ?? '',
      address: c.address,
      areaSqm: c.areaSqm,
      priceSom: tyiynToSomInput(c.pricePerSqmTyiyn),
      depositPercent: c.depositPercent,
      managerId: '',
    },
  });
  const m = useMutation({
    mutationFn: (v: z.infer<typeof editSchema>) => {
      const body: Parameters<typeof contractsApi.update>[1] = {};
      if (v.fullName !== c.fullName) body.fullName = v.fullName;
      if (v.passportNumber !== c.passportNumber) body.passportNumber = v.passportNumber;
      if (v.phone !== c.phone) body.phone = v.phone;
      if (v.email && v.email !== c.email) body.email = v.email;
      if (v.address !== c.address) body.address = v.address;
      if (Number(dec(v.areaSqm)) !== Number(c.areaSqm)) body.areaSqm = dec(v.areaSqm);
      const price = somToTyiyn(v.priceSom)!;
      if (price !== c.pricePerSqmTyiyn) body.pricePerSqmTyiyn = price;
      if (Number(dec(v.depositPercent)) !== Number(c.depositPercent)) body.depositPercent = dec(v.depositPercent);
      if (v.managerId) body.managerId = v.managerId;
      return contractsApi.update(c.id, body);
    },
    onSuccess: (updated) => { toast.success('Договор обновлён'); onSaved(updated); onClose(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const e = form.formState.errors;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg" title="Изменить договор" description="При изменении площади, цены или процента суммы пересчитываются.">
        <form onSubmit={form.handleSubmit((v) => m.mutate(v))} className="space-y-4" noValidate>
          <BuyerFields register={form.register} errors={e} prefix="ec" />
          <Field label="Адрес покупателя" htmlFor="ec-address" required error={e.address?.message}><Input id="ec-address" {...form.register('address')} /></Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Площадь, м²" htmlFor="ec-area" required error={e.areaSqm?.message}><Input id="ec-area" inputMode="decimal" {...form.register('areaSqm')} /></Field>
            <Field label="Цена за м², сом" htmlFor="ec-price" required error={e.priceSom?.message}><Input id="ec-price" inputMode="decimal" {...form.register('priceSom')} /></Field>
            <Field label="Взнос, %" htmlFor="ec-percent" required error={e.depositPercent?.message}><Input id="ec-percent" inputMode="decimal" {...form.register('depositPercent')} /></Field>
          </div>
          <ManagerSelect register={form.register} id="ec-manager" allowEmpty />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Отмена</Button>
            <Button type="submit" loading={m.isPending}>Сохранить</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
