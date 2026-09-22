'use client'

import { useId, useState } from 'react'
import DocumentPicker from '@/components/ui/DocumentPicker'
import { describeConfirmationError } from '@/features/auth/error-messages'
import { useEmailCodeConfirm } from '@/features/auth/useEmailCodeConfirm'
import {
  ALERT_CLASS,
  DANGER_BUTTON_CLASS,
  ERROR_CLASS,
  FIELD_CLASS,
  LABEL_CLASS,
  SECONDARY_BUTTON_CLASS,
} from '@/features/bookings/components/section'
import { fetchContractFile, validateContractFile } from '../api'
import { describeContractError } from '../errors'
import { useUploadContractFile } from '../queries'

type DownloadPending = null | 'download'

/**
 * Расширение для скачивания берём из фактического MIME полученного Blob, а
 * не угадываем и не доверяем имени, которого сервер вообще не присылает.
 * Неизвестный MIME → без расширения, а не наугад ".pdf".
 */
const EXTENSION_BY_MIME: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
}

/**
 * Файл отдаётся только по Bearer-токену (как приватный аватар): скачивание
 * идёт через blob и временный object URL, который сразу освобождается —
 * в хранилище и адресную строку файл не попадает.
 *
 * Загрузка с API 0.2.0 защищена кодом на почту (`action: "contract.file"`):
 * выбранный файл ждёт в памяти компонента, пока пользователь не введёт код —
 * сам файл до этого момента никуда не отправляется.
 */
export function ContractFile({
  contractId,
  hasFile,
  canManage,
}: {
  contractId: string
  hasFile: boolean
  canManage: boolean
}) {
  const codeId = useId()
  const [downloadPending, setDownloadPending] = useState<DownloadPending>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [selectionError, setSelectionError] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const challenge = useEmailCodeConfirm('contract.file', contractId)
  const uploadMutation = useUploadContractFile(contractId)

  const handleSelect = (file: File) => {
    setSelectionError(null)

    const validationError = validateContractFile(file)

    if (validationError) {
      setSelectionError(validationError)

      return
    }

    setSelectedFile(file)
    void challenge.requestCode()
  }

  const cancelUpload = () => {
    setSelectedFile(null)
    setCode('')
    setSubmitError(null)
    challenge.reset()
  }

  const submitUpload = () => {
    if (!selectedFile) {
      return
    }

    if (code.trim() === '') {
      setSubmitError('Введите код из письма.')

      return
    }

    setSubmitError(null)
    uploadMutation.mutate(
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
      const blob = await fetchContractFile(contractId)

      url = URL.createObjectURL(blob)

      const link = document.createElement('a')
      const extension = EXTENSION_BY_MIME[blob.type] ?? ''

      link.href = url
      // Имя без персональных данных: они уже полны в самом файле, но не в имени.
      link.download = `contract-${contractId}${extension}`
      link.click()
    } catch (downloadFailure) {
      setDownloadError(describeContractError(downloadFailure))
    } finally {
      if (url) {
        URL.revokeObjectURL(url)
      }

      setDownloadPending(null)
    }
  }

  if (!canManage && !hasFile) {
    return null
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2.5">
        {hasFile ? (
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

      {canManage && !selectedFile ? (
        <DocumentPicker
          accept="application/pdf,image/jpeg,image/png"
          chooseLabel={hasFile ? 'Заменить файл' : 'Загрузить подписанный файл'}
          onSelect={handleSelect}
          buttonClassName={SECONDARY_BUTTON_CLASS}
          hint={
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              PDF, JPEG или PNG, не больше 10 МБ. С телефона можно
              сфотографировать подписанный договор. Перед загрузкой сервер
              пришлёт код на почту. Загрузка переводит договор в статус
              «Подписан».
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
              <div className="space-y-1.5">
                <label htmlFor={codeId} className={LABEL_CLASS}>
                  Код из письма
                </label>
                <input
                  id={codeId}
                  type="password"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  disabled={uploadMutation.isPending}
                  onChange={(event) => {
                    setCode(event.target.value)
                  }}
                  className={FIELD_CLASS}
                />
              </div>

              {submitError ? (
                <p role="alert" className={ERROR_CLASS}>
                  {submitError}
                </p>
              ) : null}

              <div className="flex flex-wrap gap-2.5">
                <button
                  type="button"
                  disabled={uploadMutation.isPending}
                  onClick={submitUpload}
                  className={DANGER_BUTTON_CLASS}
                >
                  {uploadMutation.isPending
                    ? 'Загружаем…'
                    : 'Подтвердить и загрузить'}
                </button>
                <button
                  type="button"
                  disabled={uploadMutation.isPending}
                  onClick={cancelUpload}
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
                onClick={() => void challenge.requestCode()}
                className={SECONDARY_BUTTON_CLASS}
              >
                Запросить код ещё раз
              </button>
              <button
                type="button"
                onClick={cancelUpload}
                className={SECONDARY_BUTTON_CLASS}
              >
                Отмена
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {downloadError ? (
        <p role="alert" className={hasFile ? ALERT_CLASS : ERROR_CLASS}>
          {downloadError}
        </p>
      ) : null}
    </div>
  )
}

export default ContractFile
