'use client'

import { useMutation } from '@tanstack/react-query'
import { useId, useState } from 'react'
import Modal from '@/components/ui/Modal'
import { describeApiError } from '@/features/auth/error-messages'
import { formatArea } from '@/features/bookings/area'
import { BuyerConsent } from '@/features/bookings/components/BuyerConsent'
import {
  ALERT_CLASS,
  FIELD_CLASS,
  LABEL_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from '@/features/bookings/components/section'
import { useBuyerConsentQuery } from '@/features/bookings/queries'
import type { Lead } from '@/types/lead'
import { convertLead } from '../api'

interface ConvertLeadDialogProps {
  lead: Lead
  onClose: () => void
  onConverted: () => void
}

/**
 * Превращение обращения в бронь.
 *
 * Имя, телефон и площадь уже записаны ресепшеном и переносятся сервером —
 * менеджер добавляет только то, что можно узнать при встрече: паспорт и
 * подтверждение подписанного согласия. Без них бронь по правилам ТЗ
 * создать нельзя.
 */
export default function ConvertLeadDialog({ lead, onClose, onConverted }: ConvertLeadDialogProps) {
  const fieldId = useId()
  const consentQuery = useBuyerConsentQuery(true)
  const consentDocument = consentQuery.data ?? null

  const [passportNumber, setPassportNumber] = useState('')
  const [email, setEmail] = useState('')
  const [consentAccepted, setConsentAccepted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: convertLead.bind(null, lead.id),
    onSuccess: onConverted,
    onError: (failure) => setError(describeApiError(failure)),
  })

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    if (!consentDocument) {
      return
    }
    if (passportNumber.trim().length < 4) {
      setError('Укажите номер паспорта покупателя.')

      return
    }
    if (!consentAccepted) {
      setError('Подтвердите, что покупатель подписал согласие.')

      return
    }

    mutation.mutate({
      passportNumber: passportNumber.trim(),
      ...(email.trim() === '' ? {} : { email: email.trim() }),
      buyerConsentConfirmed: true,
      buyerConsentVersion: consentDocument.version,
    })
  }

  return (
    <Modal open title="Обращение в бронь" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          {lead.lastName} {lead.firstName} · {lead.phone} · {formatArea(lead.desiredAreaSqm)}
        </p>

        <div>
          <label className={LABEL_CLASS} htmlFor={`${fieldId}-passport`}>
            Номер паспорта
          </label>
          <input
            id={`${fieldId}-passport`}
            className={`${FIELD_CLASS} mt-1`}
            value={passportNumber}
            onChange={(event) => setPassportNumber(event.target.value)}
            disabled={mutation.isPending}
            autoComplete="off"
            placeholder="ID 1234567"
            required
          />
        </div>

        <div>
          <label className={LABEL_CLASS} htmlFor={`${fieldId}-email`}>
            Почта покупателя (необязательно)
          </label>
          <input
            id={`${fieldId}-email`}
            type="email"
            className={`${FIELD_CLASS} mt-1`}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={mutation.isPending}
            autoComplete="off"
          />
        </div>

        {consentDocument ? (
          <BuyerConsent
            document={consentDocument}
            checked={consentAccepted}
            onChange={setConsentAccepted}
            disabled={mutation.isPending}
            checkboxId={`${fieldId}-consent`}
          />
        ) : (
          <p className={ALERT_CLASS} role="alert">
            Текст согласия не загрузился — создать бронь нельзя.
          </p>
        )}

        {error ? (
          <p className={ALERT_CLASS} role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            className={PRIMARY_BUTTON_CLASS}
            disabled={mutation.isPending || !consentDocument}
          >
            {mutation.isPending ? 'Создаём бронь…' : 'Создать бронь'}
          </button>
          <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={onClose}>
            Отмена
          </button>
        </div>
      </form>
    </Modal>
  )
}
