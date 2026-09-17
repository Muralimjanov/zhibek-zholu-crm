import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { Link } from 'react-router';
import type { UseFormRegister, FieldErrors } from 'react-hook-form';
import { z } from 'zod';
import { legalApi } from '@/api/endpoints';
import { useUser } from '@/auth/AuthProvider';
import { Checkbox, Input, NativeSelect } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { useUsers } from '@/hooks/useUsers';
import { somToTyiyn } from '@/lib/money';

export const PASSPORT_RE = /^[A-Za-z0-9А-Яа-яЁё][A-Za-z0-9А-Яа-яЁё \-.]{3,31}$/;
export const PHONE_RE = /^\+?[0-9 ()-]{5,32}$/;
export const DECIMAL2_RE = /^\d{1,10}([.,]\d{1,2})?$/;

/** "45,5" -> "45.5" (the API expects a dot). */
export const dec = (v: string) => v.trim().replace(',', '.');

export const buyerSchema = {
  fullName: z.string().trim().min(1, 'Укажите ФИО').max(200),
  passportNumber: z.string().trim().regex(PASSPORT_RE, 'Номер паспорта: 4–32 символа, буквы и цифры'),
  phone: z.string().trim().regex(PHONE_RE, 'Телефон: цифры, пробелы, + ( ) -'),
  email: z.union([z.literal(''), z.string().trim().email('Неверный email').max(254)]),
};

export const areaField = z.string().trim().regex(DECIMAL2_RE, 'Площадь, например 60 или 45.5').refine((v) => Number(dec(v)) > 0, 'Больше нуля');
export const somField = z
  .string()
  .trim()
  .refine((v) => somToTyiyn(v) !== null, 'Сумма в сомах, например 50000 или 49999.50');
export const percentField = z.string().trim().regex(DECIMAL2_RE, 'Процент, например 30').refine((v) => Number(dec(v)) <= 100, 'Не больше 100');

/** Current version of the buyer consent form the manager confirms. */
export function useBuyerConsentVersion() {
  const q = useQuery({ queryKey: ['legal', 'list'], queryFn: legalApi.list, staleTime: 5 * 60_000 });
  return q.data?.find((d) => d.type === 'buyer_personal_data_consent')?.version;
}

export function BuyerFields({ register, errors, prefix }: { register: UseFormRegister<any>; errors: FieldErrors; prefix: string }) {
  const err = (k: string) => (errors[k]?.message as string | undefined) ?? undefined;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="ФИО покупателя" htmlFor={`${prefix}-fullName`} required error={err('fullName')} className="sm:col-span-2">
        <Input id={`${prefix}-fullName`} autoComplete="off" aria-invalid={Boolean(errors.fullName)} {...register('fullName')} />
      </Field>
      <Field label="Номер паспорта" htmlFor={`${prefix}-passport`} required error={err('passportNumber')}>
        <Input id={`${prefix}-passport`} autoComplete="off" aria-invalid={Boolean(errors.passportNumber)} {...register('passportNumber')} />
      </Field>
      <Field label="Телефон" htmlFor={`${prefix}-phone`} required error={err('phone')}>
        <Input id={`${prefix}-phone`} type="tel" inputMode="tel" placeholder="+996 555 12-34-56" aria-invalid={Boolean(errors.phone)} {...register('phone')} />
      </Field>
      <Field label="Email" htmlFor={`${prefix}-email`} error={err('email')} className="sm:col-span-2">
        <Input id={`${prefix}-email`} type="email" inputMode="email" aria-invalid={Boolean(errors.email)} {...register('email')} />
      </Field>
    </div>
  );
}

export function ConsentField({ register, error, version, id }: { register: UseFormRegister<any>; error?: string; version?: string; id: string }) {
  return (
    <div className="rounded-md border bg-muted/40 p-3">
      <div className="flex items-start gap-3">
        <Checkbox id={id} aria-invalid={Boolean(error)} {...register('consent')} />
        <label htmlFor={id} className="text-sm">
          Покупатель подписал согласие на обработку персональных данных
          {version && <span className="text-muted-foreground"> (форма версии {version})</span>}
        </label>
      </div>
      <Link to="/legal/buyer_personal_data_consent" target="_blank" className="mt-2 inline-flex items-center gap-1 pl-7 text-xs text-primary hover:underline">
        <FileText className="size-3.5" aria-hidden /> Открыть форму согласия для печати
      </Link>
      {error && <p role="alert" className="mt-1 pl-7 text-xs text-destructive">{error}</p>}
    </div>
  );
}

/**
 * managerId rule (backend): director must pick an active seller; head of
 * sales may pick self or a team member (default self); a sales manager is
 * always self, so the field is hidden.
 */
export function ManagerSelect({ register, error, id, allowEmpty }: { register: UseFormRegister<any>; error?: string; id: string; allowEmpty?: boolean }) {
  const me = useUser();
  const { sellers } = useUsers();
  if (me.role === 'sales_manager') return null;
  const options = me.role === 'head_of_sales' ? sellers.filter((s) => s.id === me.id || s.teamLeadId === me.id) : sellers;
  return (
    <Field label="Ответственный менеджер" htmlFor={id} required={me.role === 'director'} error={error} hint={me.role === 'head_of_sales' ? 'По умолчанию — вы' : undefined}>
      <NativeSelect id={id} aria-invalid={Boolean(error)} {...register('managerId')}>
        {(me.role === 'head_of_sales' || allowEmpty) && <option value="">{me.role === 'head_of_sales' ? 'Я сам(а)' : 'Не менять'}</option>}
        {me.role === 'director' && !allowEmpty && <option value="">Выберите менеджера…</option>}
        {options.map((s) => (
          <option key={s.id} value={s.id}>
            {s.fullName}
            {s.id === me.id ? ' (вы)' : ''}
          </option>
        ))}
      </NativeSelect>
    </Field>
  );
}
