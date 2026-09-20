'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'

/**
 * `?create=1` открывает форму создания сразу при заходе на экран — так CTA
 * с других экранов (например, дашборда) ведёт не просто в раздел, а в само
 * создание. Значение читается только при монтировании (lazy `useState`),
 * а параметр сразу убирается из URL через `router.replace`: иначе после
 * того как форму скрыли, обновление страницы открыло бы её заново.
 */
export function useCreateFlagFromQuery(): [
  boolean,
  Dispatch<SetStateAction<boolean>>,
] {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [creating, setCreating] = useState(
    () => searchParams.get('create') === '1',
  )
  const hadParamRef = useRef(creating)

  useEffect(() => {
    if (hadParamRef.current) {
      router.replace(pathname, { scroll: false })
    }
  }, [pathname, router])

  return [creating, setCreating]
}

export default useCreateFlagFromQuery
