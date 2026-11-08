import Database from 'better-sqlite3'
import { mkdir, readdir, rm, rename } from 'node:fs/promises'
import { join, resolve } from 'node:path'

export async function backup() {
  const data = process.env.DATA_DIR || resolve('data')
  const destination = process.env.BACKUP_DIR || join(data, 'backups')
  await mkdir(destination, { recursive: true, mode: 0o700 })
  const db = new Database(join(data, 'app.sqlite'), { readonly: true, fileMustExist: true })
  const name = `sp-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`
  const path = join(destination, name)
  try {
    await db.backup(`${path}.tmp`)
    const copy = new Database(`${path}.tmp`, { readonly: true })
    const result = copy.pragma('integrity_check', { simple: true })
    copy.close()
    if (result !== 'ok') throw new Error('Резервная копия не прошла проверку целостности')
    await rename(`${path}.tmp`, path)
    const files = (await readdir(destination)).filter(file => /^sp-.*\.sqlite$/.test(file)).sort().reverse()
    for (const file of files.slice(30)) await rm(join(destination, file))
    console.log(`Резервная копия сохранена: ${path}`)
  } finally { db.close() }
}
if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) await backup()
