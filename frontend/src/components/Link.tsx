import type { AnchorHTMLAttributes } from 'react'
import { useRouter } from '@/lib/router'
import { cn } from '@/lib/utils'

interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  to: string
}

export function Link({ to, className, onClick, children, ...props }: LinkProps) {
  const { navigate } = useRouter()

  return (
    <a
      href={to}
      className={cn(className)}
      onClick={(event) => {
        onClick?.(event)
        if (event.defaultPrevented) return
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        event.preventDefault()
        navigate(to)
      }}
      {...props}
    >
      {children}
    </a>
  )
}
