import Database from 'better-sqlite3'
import { join } from 'path'
import { mkdirSync } from 'fs'

export const dataDirectory = process.env.DATA_DIR || join(process.cwd(), 'data')
mkdirSync(dataDirectory, { recursive: true })

const dbPath = join(dataDirectory, 'app.sqlite')
const db = new Database(dbPath)

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('manager', 'employee')),
    manager_id INTEGER REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    deadline INTEGER NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('новая', 'в работе', 'выполнена', 'просрочена')),
    priority TEXT NOT NULL CHECK(priority IN ('высокий', 'средний', 'низкий')),
    assigned_to INTEGER NOT NULL REFERENCES users(id),
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT NOT NULL CHECK(category IN ('объявление', 'срочное', 'инструкция')),
    created_by INTEGER REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now'))
  );
`)

const deadlineColumn = (db.prepare('PRAGMA table_info(tasks)').all() as { name: string; type: string }[]).find(column => column.name === 'deadline')
if (deadlineColumn?.type === 'TEXT') {
  db.transaction(() => {
    db.exec('ALTER TABLE tasks RENAME COLUMN deadline TO deadline_legacy')
    db.exec('ALTER TABLE tasks ADD COLUMN deadline INTEGER')
    db.exec('UPDATE tasks SET deadline = deadline_legacy')
    db.exec('ALTER TABLE tasks DROP COLUMN deadline_legacy')
  })()
}

db.exec('CREATE TABLE IF NOT EXISTS departments (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE COLLATE NOCASE)')

const userColumns = new Set((db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).map(column => column.name))
for (const [name, definition] of Object.entries({
  is_admin: 'INTEGER NOT NULL DEFAULT 0 CHECK(is_admin IN (0, 1))',
  is_superadmin: 'INTEGER NOT NULL DEFAULT 0 CHECK(is_superadmin IN (0, 1))',
  is_active: 'INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1))',
  department_id: 'INTEGER REFERENCES departments(id)',
})) {
  if (!userColumns.has(name)) db.exec(`ALTER TABLE users ADD COLUMN ${name} ${definition}`)
}

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
db.pragma('busy_timeout = 5000')

const taskColumns = new Set((db.prepare('PRAGMA table_info(tasks)').all() as { name: string }[]).map(column => column.name))
db.transaction(() => {
  for (const [name, definition] of Object.entries({
    department_id: 'INTEGER REFERENCES departments(id)',
    claimed: 'INTEGER NOT NULL DEFAULT 1',
    workflow: "TEXT NOT NULL DEFAULT 'новая'",
    version: 'INTEGER NOT NULL DEFAULT 0',
    require_comment: 'INTEGER NOT NULL DEFAULT 0',
    require_photo: 'INTEGER NOT NULL DEFAULT 0',
    require_review: 'INTEGER NOT NULL DEFAULT 0',
    shift_id: 'INTEGER',
    template_id: 'INTEGER',
    occurrence: 'TEXT',
    initiative: 'INTEGER NOT NULL DEFAULT 0',
    client_id: 'TEXT',
    deleted: 'INTEGER NOT NULL DEFAULT 0',
    deletion_requested: 'INTEGER NOT NULL DEFAULT 0',
  })) {
    if (!taskColumns.has(name)) db.exec(`ALTER TABLE tasks ADD COLUMN ${name} ${definition}`)
  }
  if (!taskColumns.has('workflow')) db.exec("UPDATE tasks SET workflow = CASE WHEN status = 'просрочена' THEN 'новая' ELSE status END, status = CASE WHEN status = 'просрочена' THEN 'новая' ELSE status END")
})()

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS task_occurrence ON tasks(template_id, occurrence);
  CREATE TABLE IF NOT EXISTS task_events (
    id INTEGER PRIMARY KEY, task_id INTEGER NOT NULL REFERENCES tasks(id), actor_id INTEGER NOT NULL REFERENCES users(id),
    action TEXT NOT NULL, comment TEXT NOT NULL DEFAULT '', photo BLOB, mime TEXT, created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), kind TEXT NOT NULL, details TEXT NOT NULL, created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS operations (id TEXT NOT NULL, user_id INTEGER NOT NULL, PRIMARY KEY(id, user_id));
  CREATE TABLE IF NOT EXISTS shifts (
    id INTEGER PRIMARY KEY, title TEXT NOT NULL, starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL,
    owner_id INTEGER NOT NULL REFERENCES users(id), department_id INTEGER REFERENCES departments(id),
    closed_at INTEGER, created_by INTEGER NOT NULL REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY, title TEXT NOT NULL, items TEXT NOT NULL, department_id INTEGER REFERENCES departments(id),
    assigned_to INTEGER NOT NULL REFERENCES users(id), created_by INTEGER NOT NULL REFERENCES users(id),
    time TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, require_review INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS handovers (
    id INTEGER PRIMARY KEY, task_id INTEGER NOT NULL REFERENCES tasks(id), from_id INTEGER NOT NULL REFERENCES users(id),
    to_id INTEGER NOT NULL REFERENCES users(id), note TEXT NOT NULL, created_at INTEGER NOT NULL, accepted_at INTEGER
  );
  CREATE UNIQUE INDEX IF NOT EXISTS pending_handover ON handovers(task_id) WHERE accepted_at IS NULL;
  CREATE TABLE IF NOT EXISTS acknowledgements (
    update_id INTEGER NOT NULL REFERENCES updates(id), user_id INTEGER NOT NULL REFERENCES users(id),
    created_at INTEGER NOT NULL, PRIMARY KEY(update_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), message TEXT NOT NULL,
    created_at INTEGER NOT NULL, read_at INTEGER, pushed_at INTEGER, dedupe TEXT UNIQUE
  );
  CREATE TABLE IF NOT EXISTS subscriptions (
    endpoint TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), subscription TEXT NOT NULL
  );
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS notification_settings (
    user_id INTEGER PRIMARY KEY REFERENCES users(id),
    advance_days INTEGER NOT NULL DEFAULT 3,
    repeat_hours INTEGER NOT NULL DEFAULT 24,
    enabled INTEGER NOT NULL DEFAULT 1
  );
`)

export default db
