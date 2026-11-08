'use server'

import { cookies } from 'next/headers'
import db from '../db'
import { verifyPassword, createToken, verifyToken } from './lib'

type UserRow = {
  id: number
  name: string
  email: string
  password_hash: string
  role: 'manager' | 'employee'
  manager_id: number | null
}

import { getPerson } from '../people'

export async function login(email: string, password: string) {
  const row = db.prepare('SELECT id, name, email, password_hash, role, manager_id FROM users WHERE email = ? COLLATE NOCASE AND is_active = 1').get(email) as UserRow | undefined
  if (!row) return { ok: false, error: 'Неверный email или пароль' }

  const valid = await verifyPassword(password, row.password_hash)
  if (!valid) return { ok: false, error: 'Неверный email или пароль' }

  const token = await createToken({ id: row.id })

  const jar = await cookies()
  jar.set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  })

  return { ok: true }
}

export async function logout() {
  const jar = await cookies()
  jar.delete('session')
}

export async function getUser() {
  const jar = await cookies()
  const token = jar.get('session')?.value
  if (!token) return null
  const session = await verifyToken(token)
  if (!session || !Number.isInteger(session.id)) return null
  const person = getPerson(session.id)
  return person?.is_active ? person : null
}
