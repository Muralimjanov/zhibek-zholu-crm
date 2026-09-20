/** Инициалы для запасного аватара: до двух первых букв ФИО. */
export function getInitials(fullName: string): string {
  const parts = fullName
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2)

  if (parts.length === 0) {
    return '—'
  }

  return parts.map((part) => part[0]?.toLocaleUpperCase('ru-RU') ?? '').join('')
}
