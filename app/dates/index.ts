export function parseDeadline(value: FormDataEntryValue | null): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null
  const date = new Date(`${value}:00+03:00`)
  if (!Number.isFinite(date.getTime())) return null
  const local = new Date(date.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 16)
  return local === value ? date.getTime() : null
}

export function formatDeadline(value: number | string): string {
  if (typeof value === 'string') return value
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow',
  }).format(new Date(value))
}
