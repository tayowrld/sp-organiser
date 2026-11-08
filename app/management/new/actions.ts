'use server'

import { redirect } from 'next/navigation'
import { randomUUID } from 'node:crypto'
import { getUser } from '../../auth/actions'
import { applyOperation } from '../../operations'

export async function createTask(formData: FormData) {
  const user = await getUser()
  if (!user) redirect('/login')
  applyOperation(user, { ...Object.fromEntries(formData.entries()), id: randomUUID(), kind: 'create' })
  redirect('/work')
}
