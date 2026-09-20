'use client'

import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import ErrorState from '@/components/ui/ErrorState'
import {
  TABLE_CELL_CLASS,
  TABLE_CELL_STRONG_CLASS,
  TABLE_HEAD_CELL_CLASS,
  TABLE_HEAD_ROW_CLASS,
  TABLE_ROW_CLASS,
} from '@/components/ui/table'
import TableCard from '@/components/ui/TableCard'
import TableSkeleton from '@/components/ui/TableSkeleton'
import { describeApiError } from '@/features/auth/error-messages'
import { formatRole } from '@/features/auth/labels'
import { UserInitialsAvatar } from '@/features/profile/components/UserAvatar'
import { formatUserStatus, userStatusTone } from '../labels'
import { useUsersQuery } from '../queries'
import { SECTION_CLASS, SECTION_TITLE_CLASS } from './section'

export function UsersList({ heading }: { heading: string }) {
  const { data, isPending, isError, error, refetch, isFetching } =
    useUsersQuery(true)

  return (
    <section className={SECTION_CLASS} aria-labelledby="users-list-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="users-list-heading" className={SECTION_TITLE_CLASS}>
          {heading}
        </h2>
        <button
          type="button"
          disabled={isFetching}
          onClick={() => void refetch()}
          className="inline-flex min-h-11 items-center text-sm font-medium text-brand-700 underline underline-offset-4 disabled:opacity-60 dark:text-brand-300"
        >
          {isFetching ? 'Обновляем…' : 'Обновить'}
        </button>
      </div>

      <div className="mt-4">
        {isPending ? (
          <TableSkeleton
            caption="Загружаем список сотрудников"
            columns={['ФИО', 'Логин', 'Роль', 'Статус', 'Телефон', 'Почта']}
            minWidthClassName="min-w-[40rem]"
          />
        ) : isError ? (
          <ErrorState
            message={describeApiError(error)}
            onRetry={() => void refetch()}
          />
        ) : data.length === 0 ? (
          <EmptyState
            title="Пока никого нет"
            description="Созданные аккаунты появятся здесь после подтверждения директором."
          />
        ) : (
          <TableCard>
            <table className="w-full min-w-[40rem] border-collapse">
              <caption className="sr-only">{heading}</caption>
              <thead>
                <tr className={TABLE_HEAD_ROW_CLASS}>
                  <th scope="col" className={TABLE_HEAD_CELL_CLASS}>
                    ФИО
                  </th>
                  <th scope="col" className={TABLE_HEAD_CELL_CLASS}>
                    Логин
                  </th>
                  <th scope="col" className={TABLE_HEAD_CELL_CLASS}>
                    Роль
                  </th>
                  <th scope="col" className={TABLE_HEAD_CELL_CLASS}>
                    Статус
                  </th>
                  <th scope="col" className={TABLE_HEAD_CELL_CLASS}>
                    Телефон
                  </th>
                  <th scope="col" className={TABLE_HEAD_CELL_CLASS}>
                    Почта
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map((item) => (
                  <tr key={item.id} className={TABLE_ROW_CLASS}>
                    <td className={TABLE_CELL_STRONG_CLASS}>
                      <div className="flex items-center gap-2.5">
                        <UserInitialsAvatar fullName={item.fullName} />
                        {item.fullName}
                      </div>
                    </td>
                    <td className={TABLE_CELL_CLASS}>{item.username}</td>
                    <td className={TABLE_CELL_CLASS}>
                      {formatRole(item.role)}
                    </td>
                    <td className={TABLE_CELL_CLASS}>
                      <Badge tone={userStatusTone(item.status)}>
                        {formatUserStatus(item.status)}
                      </Badge>
                    </td>
                    <td className={TABLE_CELL_CLASS}>{item.phone ?? '—'}</td>
                    <td className={`${TABLE_CELL_CLASS} break-all`}>
                      {item.email ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>
        )}
      </div>
    </section>
  )
}

export default UsersList
