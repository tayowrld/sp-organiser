import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'
import { join, resolve } from 'node:path'
import { mkdirSync } from 'node:fs'

const dataDirectory = process.env.DATA_DIR || resolve('data')
mkdirSync(dataDirectory, { recursive: true })
const db = new Database(join(dataDirectory, 'app.sqlite'))
db.exec(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('manager', 'employee')),
  manager_id INTEGER REFERENCES users(id)
)`)
const columns = new Set(db.prepare('PRAGMA table_info(users)').all().map(column => column.name))
for (const [name, fallback] of [['is_admin', 0], ['is_superadmin', 0], ['is_active', 1]]) {
  if (!columns.has(name)) db.exec(`ALTER TABLE users ADD COLUMN ${name} INTEGER NOT NULL DEFAULT ${fallback} CHECK(${name} IN (0, 1))`)
}
if (db.prepare('SELECT id FROM users WHERE is_superadmin = 1').get()) {
  console.log('Главный администратор уже существует. Изменения не внесены.')
} else {
  const email = process.env.ADMIN_EMAIL || 'admin@sp.local'
  const password = process.env.ADMIN_PASSWORD || randomBytes(18).toString('base64url')
  if (password.length < 12) throw new Error('Пароль должен содержать не менее 12 символов')
  if (db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE').get(email)) throw new Error('Почта занята. Укажите другую ADMIN_EMAIL')
  const hash = await bcrypt.hash(password, 12)
  db.prepare("INSERT INTO users (name, email, password_hash, role, is_admin, is_superadmin) VALUES (?, ?, ?, 'employee', 1, 1)").run('Главный администратор', email, hash)
  console.log(`Главный администратор создан\nПочта: ${email}\nПароль: ${password}`)
}
db.close()
