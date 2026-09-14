/** Tailwind classes for the item-status badge, keyed by the raw status value. */
export function statusBadgeClass(status?: string): string {
  switch (status) {
    case 'Shortlisted':
      return 'border border-celeste text-celeste bg-transparent'
    case 'Test Ridden':
      return 'bg-celeste text-celeste-foreground'
    case 'Rejected':
      return 'bg-muted text-muted-foreground line-through decoration-1'
    case 'Bought':
      return 'bg-hiviz text-hiviz-foreground'
    case 'Thinking':
    default:
      return 'border border-border text-muted-foreground bg-transparent'
  }
}
