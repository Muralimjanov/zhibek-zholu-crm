import Skeleton from './Skeleton'
import {
  TABLE_CELL_CLASS,
  TABLE_HEAD_CELL_CLASS,
  TABLE_HEAD_ROW_CLASS,
  TABLE_ROW_CLASS,
} from './table'
import TableCard from './TableCard'

/**
 * Форма загрузки таблицы: те же заголовки, что у реальной таблицы (передаёт
 * вызывающий код), чтобы колонки не «прыгали» между состояниями загрузки и
 * данных. Общий для всех модулей — не плодим по одному на таблицу.
 */
export function TableSkeleton({
  caption,
  columns,
  rows = 5,
  minWidthClassName = 'min-w-[52rem]',
}: {
  caption: string
  columns: string[]
  rows?: number
  minWidthClassName?: string
}) {
  return (
    <TableCard>
      <table className={`w-full ${minWidthClassName} border-collapse`}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className={TABLE_HEAD_ROW_CLASS}>
            {columns.map((label, index) => (
              <th key={index} scope="col" className={TABLE_HEAD_CELL_CLASS}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <tr key={rowIndex} className={TABLE_ROW_CLASS}>
              {columns.map((__, colIndex) => (
                <td key={colIndex} className={TABLE_CELL_CLASS}>
                  <Skeleton className="h-4 w-full max-w-24" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </TableCard>
  )
}

export default TableSkeleton
