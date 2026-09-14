import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'

export function StarRatingDisplay({ rating, className }: { rating: number; className?: string }) {
  return (
    <div className={cn('flex items-center gap-0.5 text-celeste', className)}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cn('size-3.5', i > rating && 'text-border')} fill={i <= rating ? 'currentColor' : 'none'} />
      ))}
    </div>
  )
}

export function StarRatingInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          aria-label={`${i} Sterne`}
          onClick={() => onChange(value === i ? 0 : i)}
          className="rounded p-0.5 text-celeste focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Star className={cn('size-5', i > value && 'text-border')} fill={i <= value ? 'currentColor' : 'none'} />
        </button>
      ))}
    </div>
  )
}
