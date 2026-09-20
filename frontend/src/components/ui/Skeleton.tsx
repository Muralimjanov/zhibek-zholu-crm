/**
 * Форма загрузки без содержимого. Глобальный `prefers-reduced-motion` в
 * globals.css обнуляет длительность анимации, но не останавливает саму
 * `animation-iteration-count` на промежуточном кадре — `pulse` может
 * застыть на пониженной opacity. `motion-reduce:animate-none` убирает
 * анимацию совсем, а не просто ускоряет её.
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-control bg-zinc-200/70 motion-reduce:animate-none dark:bg-zinc-800/60 ${className}`}
    />
  )
}

export default Skeleton
