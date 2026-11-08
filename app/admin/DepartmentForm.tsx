'use client'

import { useActionState } from 'react'
import { createDepartment } from './actions'

export default function DepartmentForm() {
  const [state, action, pending] = useActionState(createDepartment, { error: '', success: '' })
  return <form action={action} className='person-form'><label>Название отдела<input name='name' required maxLength={100} placeholder='Например, кухня' /></label>{state.error && <p role='alert' className='form-error'>{state.error}</p>}{state.success && <p role='status' className='form-success'>{state.success}</p>}<button type='submit' disabled={pending}>{pending ? 'Сохранение…' : 'Добавить отдел'}</button></form>
}
