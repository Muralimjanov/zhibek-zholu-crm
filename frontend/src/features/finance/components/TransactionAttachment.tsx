'use client'

import { useId, useState } from 'react'
import DocumentPicker from '@/components/ui/DocumentPicker'
import { describeConfirmationError } from '@/features/auth/error-messages'
import { useEmailCodeConfirm } from '@/features/auth/useEmailCodeConfirm'
import {
  ALERT_CLASS,
  ERROR_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from '@/features/bookings/components/section'
import TextField from '@/features/bookings/components/TextField'
import { fetchTransactionAttachment } from '../api'
import {
  TRANSACTION_ATTACHMENT_MIME_TYPES,
  validateTransactionAttachment,
} from '../attachment'
import { describeFinanceError } from '../errors'
import { formatAttachmentStatus } from '../labels'
import type { useUploadTransactionAttachment } from '../queries'

type DownloadPending = null | 'download'

/**
 * Расширение для скачивания берём из фактического MIME полученного Blob, а
 * не угадываем и не доверяем имени, которого сервер вообще не присылает —
 * тот же приём, что в `contracts/components/ContractFile.tsx`.
 */
const EXTENSION_BY_MIME: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
}

/**
 * Вложение к операции — скачивание и загрузка, по образцу
 * `contracts/components/ContractFile.tsx`.
 *
 * Скачивание (`GET /transactions/{id}/attachment`) отдаёт файл по
 * Bearer-токену без кода подтверждения и доступно любому, кто видит
 * карточку (директор и бухгалтер), включая запись за закрытый месяц —
 * подтверждено и текстом опубликованной схемы API 0.3.0, и живым PNG-файлом
 * (загрузка и скачивание пройдены целиком 18.09.2026, см.
 * `FINANCE_API_EXAMPLES.md`). Идёт через blob и временный object URL,
 * который сразу освобождается.
 *
 * Загрузка защищена кодом на почту (`transaction.attachment`,
 * `resourceId: id`) и доступна только автору записи до закрытия месяца —
 * `canUpload` вычисляется в `TransactionCard` через `canEditTransaction`.
 * `mutation`/`disabled` подняты туда же: правка и загрузка одной записи не
 * должны идти одновременно.
 */
export function TransactionAttachment({
  transactionId,
  hasAttachment,
  canUpload,
  mutation,
  disabled,
}: {
  transactionId: string
  hasAttachment: boolean | null
  canUpload: boolean
  mutation: ReturnType<typeof useUploadTransactionAttachment>
  disabled: boolean
}) {
  const codeId = useId()
  const [downloadPending, setDownloadPending] = useState<DownloadPending>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [selectionError, setSelectionError] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const challenge = useEmailCodeConfirm('transaction.attachment', transactionId)

  const handleSelect = (file: File) => {
    setSelectionError(null)

    const validationError = validateTransactionAttachment(file)

    if (validationError) {
      setSelectionError(validationError)

      return
    }

    setSelectedFile(file)
    void challenge.requestCode()
  }

  const cancel = () => {
    setSelectedFile(null)
    setCode('')
    setSubmitError(null)
    challenge.reset()
  }

  const submit = () => {
    if (!selectedFile) {
      return
    }

    if (code.trim() === '') {
      setSubmitError('Введите код из письма.')

      return
    }

    setSubmitError(null)
    mutation.mutate(
      { file: selectedFile, headers: challenge.headersFor(code.trim()) },
      {
        onSuccess: () => {
          setSelectedFile(null)
          setCode('')
          challenge.reset()
        },
        onError: (uploadError) => {
          setSubmitError(describeConfirmationError(uploadError))
        },
      },
    )
  }

  const handleDownload = async () => {
    setDownloadError(null)
    setDownloadPending('download')

    let url: string | null = null

    try {
      const blob = await fetchTransactionAttachment(transactionId)

      url = URL.createObjectURL(blob)

      const link = document.createElement('a')
      const extension = EXTENSION_BY_MIME[blob.type] ?? ''

      link.href = url
      // Имя без персональных данных — только id операции.
      link.download = `transaction-${transactionId}${extension}`
      link.click()
    } catch (downloadFailure) {
      setDownloadError(describeFinanceError(downloadFailure))
    } finally {
      if (url) {
        URL.revokeObjectURL(url)
      }

      setDownloadPending(null)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-700 dark:text-zinc-300">
        Подтверждающий файл: {formatAttachmentStatus(hasAttachment)}.
      </p>

      {canUpload && disabled ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Запись сейчас редактируется — загрузка временно недоступна.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2.5">
        {hasAttachment === true ? (
          <button
            type="button"
            disabled={downloadPending !== null}
            onClick={() => void handleDownload()}
            className={SECONDARY_BUTTON_CLASS}
          >
            {downloadPending === 'download' ? 'Скачиваем…' : 'Скачать файл'}
          </button>
        ) : null}

      </div>

      {canUpload && !selectedFile ? (
        <DocumentPicker
          accept={TRANSACTION_ATTACHMENT_MIME_TYPES.join(',')}
          chooseLabel={hasAttachment === true ? 'Заменить файл' : 'Загрузить файл'}
          onSelect={handleSelect}
          disabled={disabled}
          buttonClassName={SECONDARY_BUTTON_CLASS}
          hint={
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              PDF, JPEG или PNG, не больше 10 МБ. Чек можно сфотографировать
              телефоном. Перед загрузкой сервер пришлёт код на почту.
            </p>
          }
        />
      ) : null}

      {selectionError ? (
        <p role="alert" className={ERROR_CLASS}>
          {selectionError}
        </p>
      ) : null}

      {selectedFile ? (
        <div className="space-y-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            Файл выбран: {selectedFile.name}.
          </p>

          {challenge.phase === 'requesting' ? (
            <p role="status" className="text-sm text-zinc-500">
              Отправляем код на почту…
            </p>
          ) : challenge.phase === 'awaiting-code' ? (
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              Код подтверждения отправлен на вашу почту.
            </p>
          ) : null}

          {challenge.error ? (
            <p role="alert" className={ALERT_CLASS}>
              {challenge.error}
            </p>
          ) : null}

          {challenge.phase === 'awaiting-code' ? (
            <>
              <TextField
                id={codeId}
                label="Код из письма"
                type="password"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                disabled={mutation.isPending}
                onChange={(event) => {
                  setCode(event.target.value)
                }}
              />

              {submitError ? (
                <p role="alert" className={ERROR_CLASS}>
                  {submitError}
                </p>
              ) : null}

              <div className="flex flex-wrap gap-2.5">
                <button
                  type="button"
                  disabled={mutation.isPending || disabled}
                  onClick={submit}
                  className={PRIMARY_BUTTON_CLASS}
                >
                  {mutation.isPending
                    ? 'Загружаем…'
                    : 'Подтвердить и загрузить'}
                </button>
                <button
                  type="button"
                  disabled={mutation.isPending}
                  onClick={cancel}
                  className={SECONDARY_BUTTON_CLASS}
                >
                  Отмена
                </button>
              </div>
            </>
          ) : challenge.phase === 'idle' && challenge.error ? (
            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                disabled={disabled}
                onClick={() => void challenge.requestCode()}
                className={SECONDARY_BUTTON_CLASS}
              >
                Запросить код ещё раз
              </button>
              <button
                type="button"
                onClick={cancel}
                className={SECONDARY_BUTTON_CLASS}
              >
                Отмена
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {downloadError ? (
        <p role="alert" className={ALERT_CLASS}>
          {downloadError}
        </p>
      ) : null}
    </div>
  )
}

export default TransactionAttachment
