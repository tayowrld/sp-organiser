'use client'

import { useActionState, useState } from 'react'
import { savePerson } from './actions'
import type { Person, Department } from '../people'

type Option = { id: number; name: string }

export default function PersonForm({ person, managers, superadmin, departments }: { person?: Person; managers: Option[]; superadmin: boolean; departments: Department[] }) {
  const [isAdmin, setIsAdmin] = useState(Boolean(person?.is_admin))
  const [state, action, pending] = useActionState(savePerson, { error: '', success: '' })
  return <form action={action} className='person-form'>
    <input type='hidden' name='id' value={person?.id || ''} />
    <label>Имя и фамилия<input name='name' required maxLength={120} defaultValue={person?.name} autoComplete='name' /></label>
    <label>Электронная почта<input name='email' type='email' required defaultValue={person?.email} autoComplete='email' /></label>
    <label>{person ? 'Новый пароль' : 'Пароль'}<input name='password' type='password' minLength={12} required={!person} autoComplete='new-password' /><small>{person ? 'Оставьте пустым, чтобы сохранить текущий пароль.' : 'Не менее 12 символов.'}</small></label>
    {superadmin && <><label>Руководитель<select name='manager_id' defaultValue={person?.manager_id ?? ''}><option value=''>Без руководителя</option>{managers.filter(manager => manager.id !== person?.id).map(manager => <option key={manager.id} value={manager.id}>{manager.name}</option>)}</select></label><label className='checkbox-field'><input type='checkbox' name='is_admin' checked={isAdmin} onChange={event => setIsAdmin(event.target.checked)} />Администратор</label>{isAdmin && <label>Отдел<select name='department_id' defaultValue={person?.department_id ?? ''}><option value=''>Наследовать от руководителя</option>{departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}</select><small>Назначенный отдел наследуется персоналом этого администратора.</small></label>}</>}
    <label className='checkbox-field'><input type='checkbox' name='is_active' defaultChecked={person ? Boolean(person.is_active) : true} />Аккаунт активен</label>
    {state.error && <p role='alert' className='form-error'>{state.error}</p>}
    {state.success && <p role='status' className='form-success'>{state.success}</p>}
    <button type='submit' disabled={pending}>{pending ? 'Сохранение…' : person ? 'Сохранить изменения' : 'Создать пользователя'}</button>
  </form>
}
