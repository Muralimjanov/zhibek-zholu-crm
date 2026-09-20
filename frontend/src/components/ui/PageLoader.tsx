export function PageLoader({ label = 'Загрузка…' }: { label?: string }) {
  return (
    <div
      className="flex min-h-dvh items-center justify-center px-4 py-12"
      role="status"
      aria-live="polite"
    >
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{label}</p>
    </div>
  )
}

export default PageLoader
