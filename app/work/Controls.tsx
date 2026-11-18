'use client'

import { ImagePlus, X } from 'lucide-react'
import { useEffect, useId, useMemo, useState } from 'react'
import type { Task } from '../operations'

type Person = { id: number; name: string; assignable: boolean; department: number | null }
type Department = { id: number; name: string; assignable: boolean }

export function PhotoField({ required = false }: { required?: boolean }) {
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const id = useId()
  const preview = useMemo(() => file ? URL.createObjectURL(file) : '', [file])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  return <div className='photo-field'>
    <label htmlFor={id}>Фотография {required && <span>· обязательна</span>}</label>
    {preview ? <div className='photo-preview'><img src={preview} alt='Выбранная фотография' /><button type='button' className='icon-button' aria-label='Убрать фотографию' onClick={() => { setFile(null); const input = document.getElementById(id) as HTMLInputElement | null; if (input) input.value = '' }}><X size={17} /></button></div> : <span className='photo-placeholder'><ImagePlus size={22} /></span>}
    <input id={id} type='file' name='photo' accept='image/*,.heic,.heif' capture='environment' aria-required={required} aria-describedby={`${id}-hint`} aria-invalid={Boolean(error)} onChange={event => {
      const input = event.currentTarget
      const selected = input.files?.[0] || null
      const problem = selected && !selected.type.startsWith('image/') && !/\.(heic|heif)$/i.test(selected.name) ? 'Выберите файл фотографии' : selected && selected.size > 20 * 1024 * 1024 ? 'Исходная фотография должна быть меньше 20 МБ' : ''
      setError(problem || '')
      input.setCustomValidity(problem || '')
      if (problem) input.reportValidity()
      setFile(problem ? null : selected)
    }} />
    <small id={`${id}-hint`}>Сделайте фото с камеры, до 20 МБ. Перед отправкой изображение уменьшается.</small>
    {error && <p className='form-error' role='alert'>{error}</p>}
  </div>
}

export function RecipientFields({ people, departments }: { people: Person[]; departments: Department[] }) {
  const [target, setTarget] = useState<'employee' | 'department'>('employee')
  const [department, setDepartment] = useState('')
  const assignable = people.filter(person => person.assignable && (target === 'employee' || !department || person.department === Number(department)))
  return <div className='recipient-fields'>
    <div className='segmented-control' aria-label='Кому назначить'>
      <button type='button' className={target === 'employee' ? 'selected' : ''} aria-pressed={target === 'employee'} onClick={() => { setTarget('employee'); setDepartment('') }}>Сотруднику</button>
      <button type='button' className={target === 'department' ? 'selected' : ''} aria-pressed={target === 'department'} onClick={() => setTarget('department')}>Отделу</button>
    </div>
    {target === 'department' && <label>Отдел<select name='department' required value={department} onChange={event => setDepartment(event.target.value)}><option value=''>Выберите отдел</option>{departments.filter(item => item.assignable).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
    <label>{target === 'department' ? 'Ответственный в отделе' : 'Сотрудник'}<select name='employee' required={target === 'employee'} defaultValue='' key={`${target}-${department}`}><option value=''>{target === 'department' ? 'Ответственный примет задачу сам' : 'Выберите сотрудника'}</option>{assignable.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select>{target === 'department' && <small>Можно назначить конкретного человека — задача останется задачей отдела.</small>}</label>
  </div>
}

export function ResultForm({ task, owner, reviewer, busy, onSubmit }: { task: Task; owner: boolean; reviewer: boolean; busy: boolean; onSubmit: (kind: string, form: FormData, extra: Record<string, unknown>) => Promise<void> }) {
  const [error, setError] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [action, setAction] = useState('')
  const complete = action === 'complete'
  return <form className='work-form' onSubmit={async event => {
    event.preventDefault()
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
    const form = new FormData(event.currentTarget)
    const kind = submitter?.value || ''
    form.set('action', kind)
    const comment = String(form.get('comment') || '').trim()
    const file = form.get('photo')
    const problem = kind === 'complete' && task.require_comment && !comment ? 'Добавьте комментарий о результате' : kind === 'complete' && task.require_photo && !(file instanceof File && file.size) ? 'Прикрепите фотографию результата' : ['problem', 'reject'].includes(kind) && !comment ? kind === 'problem' ? 'Опишите, что именно мешает выполнить задачу' : 'Укажите, что нужно исправить' : ''
    setError(problem)
    if (problem) return
    await onSubmit(kind, form, { task: task.id, version: task.version })
  }}>
    <label>Комментарий<textarea name='comment' maxLength={4000} aria-required={complete && Boolean(task.require_comment) || ['problem', 'reject'].includes(action)} placeholder='Результат, проблема или необходимые исправления' onChange={() => setError('')} /></label>
    <div onChange={event => { const input = (event.target as HTMLElement).closest('input[name=photo]') as HTMLInputElement | null; setPhoto(input?.files?.[0] || null); setError('') }}><PhotoField required={complete && Boolean(task.require_photo) && !photo} /></div>
    {error && <p className='form-error' role='alert'>{error}</p>}
    <div className='work-actions'>
      {owner && ['в работе', 'проблема'].includes(task.workflow) ? <button name='action' value='complete' disabled={busy} onClick={() => setAction('complete')}>Завершить задачу</button> : null}
      {owner && ['новая', 'в работе', 'проблема'].includes(task.workflow) ? <button name='action' value='problem' className='secondary' disabled={busy} onClick={() => setAction('problem')}>Сообщить о проблеме</button> : null}
      {reviewer && task.workflow === 'на проверке' ? <><button name='action' value='approve' disabled={busy} onClick={() => setAction('approve')}>Подтвердить результат</button><button name='action' value='reject' className='secondary' disabled={busy} onClick={() => setAction('reject')}>Вернуть на доработку</button></> : null}
    </div>
  </form>
}
