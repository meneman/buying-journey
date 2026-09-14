import { PHASES } from '@/lib/types'
import { cn } from '@/lib/utils'

interface AscentTrackerProps {
  phase: string
  budget: string
  targetDate: string
  onPhaseChange: (value: string) => void
  onBudgetChange: (value: string) => void
  onTargetDateChange: (value: string) => void
}

// An elevation-profile-style route: a false flat early on, a steep pull, a short
// ridge, then the final push to the summit — shaped like a real climb, not a
// straight line, but always ascending (never lower than the previous waypoint).
const WAYPOINTS = [
  { x: 55, y: 166 },
  { x: 233, y: 142 },
  { x: 411, y: 136 },
  { x: 589, y: 98 },
  { x: 767, y: 86 },
  { x: 945, y: 30 },
]
const BASELINE_Y = 186
const VIEW_W = 1000
const VIEW_H = 200

function pathFor(points: { x: number; y: number }[]) {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
}

function areaFor(points: { x: number; y: number }[]) {
  if (points.length === 0) return ''
  const first = points[0]
  const last = points[points.length - 1]
  return `${pathFor(points)} L${last.x},${BASELINE_Y} L${first.x},${BASELINE_Y} Z`
}

function daysUntil(dateStr: string): string | null {
  if (!dateStr) return null
  const target = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(target.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000)
  if (diffDays > 1) return `noch ${diffDays} Tage`
  if (diffDays === 1) return 'morgen'
  if (diffDays === 0) return 'heute'
  return `${Math.abs(diffDays)} Tage überfällig`
}

export function AscentTracker({
  phase,
  budget,
  targetDate,
  onPhaseChange,
  onBudgetChange,
  onTargetDateChange,
}: AscentTrackerProps) {
  const currentIndex = Math.max(
    0,
    PHASES.findIndex((p) => p.value === phase),
  )
  const remaining = daysUntil(targetDate)

  return (
    <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch">
        <div className="relative flex-1">
          <svg
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            className="h-40 w-full sm:h-44"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="ascent-full" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--steel)" stopOpacity="0.22" />
                <stop offset="100%" stopColor="var(--steel)" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="ascent-done" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--celeste)" stopOpacity="0.38" />
                <stop offset="100%" stopColor="var(--celeste)" stopOpacity="0" />
              </linearGradient>
            </defs>

            <path d={areaFor(WAYPOINTS)} fill="url(#ascent-full)" />
            <path d={areaFor(WAYPOINTS.slice(0, currentIndex + 1))} fill="url(#ascent-done)" />

            <path
              d={pathFor(WAYPOINTS.slice(currentIndex))}
              fill="none"
              stroke="var(--steel)"
              strokeWidth="2"
              strokeDasharray="3 7"
              strokeLinecap="round"
            />
            <path
              d={pathFor(WAYPOINTS.slice(0, currentIndex + 1))}
              fill="none"
              stroke="var(--celeste)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {WAYPOINTS.map((point, i) => {
              const isDone = i <= currentIndex
              const isCurrent = i === currentIndex
              const isSummit = i === WAYPOINTS.length - 1
              return (
                <g key={i}>
                  {isCurrent && (
                    <circle cx={point.x} cy={point.y} r={13} fill="var(--celeste)" opacity="0.18" />
                  )}
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={isCurrent ? 7 : 5}
                    fill={isDone ? 'var(--celeste)' : 'var(--card)'}
                    stroke={isDone ? 'var(--celeste)' : 'var(--steel)'}
                    strokeWidth={isSummit && !isDone ? 1.5 : 2}
                  />
                  {isSummit && (
                    <g stroke={isDone ? 'var(--celeste)' : 'var(--steel)'} strokeWidth="2" strokeLinecap="round">
                      <line x1={point.x} y1={point.y - 4} x2={point.x} y2={point.y - 28} />
                      <path
                        d={`M${point.x},${point.y - 28} l14,5 l-14,5 Z`}
                        fill={isDone ? 'var(--celeste)' : 'none'}
                      />
                    </g>
                  )}
                </g>
              )
            })}
          </svg>

          <div className="mt-1 grid grid-cols-6 gap-1 text-center">
            {PHASES.map((p, i) => {
              const isCurrent = p.value === phase
              const isDone = i <= currentIndex
              return (
                <button
                  key={p.value}
                  type="button"
                  aria-current={isCurrent}
                  onClick={() => onPhaseChange(p.value)}
                  className={cn(
                    'rounded-md px-0.5 py-1.5 font-mono text-[10px] uppercase tracking-wide transition-colors sm:text-xs',
                    'hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                    isCurrent ? 'font-semibold text-celeste' : isDone ? 'text-foreground/70' : 'text-muted-foreground',
                  )}
                >
                  {p.label.replace(/\s*🎉/, '')}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex shrink-0 flex-row gap-3 border-t border-border pt-4 lg:w-56 lg:flex-col lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
          <label className="flex-1">
            <span className="block font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Budget</span>
            <input
              value={budget}
              onChange={(e) => onBudgetChange(e.target.value)}
              placeholder="z.B. 2500€"
              className="w-full border-0 bg-transparent p-0 font-mono text-xl font-medium text-foreground focus:outline-none"
            />
          </label>
          <label className="flex-1">
            <span className="block font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
              Ziel-Datum
            </span>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => onTargetDateChange(e.target.value)}
              className="w-full border-0 bg-transparent p-0 font-mono text-xl font-medium text-foreground focus:outline-none"
            />
            {remaining && <span className="font-mono text-[11px] text-celeste">{remaining}</span>}
          </label>
        </div>
      </div>
    </div>
  )
}
