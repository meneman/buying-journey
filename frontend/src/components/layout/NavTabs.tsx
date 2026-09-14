import { LayoutDashboard, GitCompare, MessageSquare, SlidersHorizontal } from 'lucide-react'
import { Link } from '@/components/Link'
import { useJourneyHref, useRouter } from '@/lib/router'
import { cn } from '@/lib/utils'

const TABS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/vergleich', label: 'Vergleich', icon: GitCompare },
  { to: '/feedback', label: 'Feedback', icon: MessageSquare },
  { to: '/eigenschaften', label: 'Eigenschaften', icon: SlidersHorizontal },
]

export function NavTabs() {
  const { pathname } = useRouter()
  const withJourney = useJourneyHref()

  return (
    <nav className="flex items-center gap-1 font-mono text-xs uppercase tracking-wide">
      {TABS.map((tab) => {
        const active = pathname === tab.to
        const Icon = tab.icon
        return (
          <Link
            key={tab.to}
            to={withJourney(tab.to)}
            className={cn(
              'flex items-center gap-1.5 rounded-md border-b-2 border-transparent px-2.5 py-1.5 transition-colors',
              active ? 'border-celeste text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="size-3.5" />
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
