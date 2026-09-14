import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faMoon, faSun } from '@fortawesome/free-solid-svg-icons'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      title={isDark ? 'Helles Design' : 'Dunkles Design'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? <FontAwesomeIcon icon={faSun} className="size-4" /> : <FontAwesomeIcon icon={faMoon} className="size-4" />}
    </Button>
  )
}
