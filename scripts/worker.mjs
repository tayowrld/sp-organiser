import { backup } from './backup.mjs'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

if (!process.env.MAINTENANCE_SECRET) throw new Error('Задайте MAINTENANCE_SECRET')
const marker = join(process.env.DATA_DIR || resolve('data'), 'last-backup')
async function tick() {
  try {
    const response = await fetch(new URL('/api/maintenance', process.env.INTERNAL_APP_URL || 'http://127.0.0.1:6553'), { method: 'POST', headers: { Authorization: `Bearer ${process.env.MAINTENANCE_SECRET}` }, signal: AbortSignal.timeout(55000) })
    if (!response.ok) throw new Error(`Обслуживание: HTTP ${response.status}`)
  } catch (error) { console.error('Ошибка фонового обслуживания', error.message) }
  try {
    const day = new Date().toISOString().slice(0, 10)
    const last = await readFile(marker, 'utf8').catch(() => '')
    if (day !== last) { await backup(); await writeFile(marker, day, { mode: 0o600 }) }
  } catch (error) { console.error('Ошибка резервного копирования', error.message) }
  setTimeout(tick, 60000)
}
await tick()
