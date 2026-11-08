'use client'

import { nodesToSvg } from '@ikions/icons'
import home from '@ikions/icons/nodes/home'

type IconData = typeof home

export function IkonsIcon({ data, variant = 'outline', size = 24, className }: {
  data: IconData
  variant?: 'outline' | 'filled'
  size?: number
  className?: string
}) {
  const svg = nodesToSvg(data[variant], variant, { size })
  return <span className={className} dangerouslySetInnerHTML={{ __html: svg }} />
}
