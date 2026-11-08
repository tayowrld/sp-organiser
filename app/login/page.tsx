'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { clearLocal, readLocal } from '../work/storage'
import { login, getUser } from '../auth/actions'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError('')
    const result = await login(email, password)
    setPending(false)
    if (!result.ok) {
      setError(result.error || 'Ошибка входа')
      return
    }
    const cached = await readLocal<{ user: { id: number } }>('snapshot')
    const current = await getUser()
    if (cached && current && cached.user.id !== current.id) await clearLocal()
    if ('caches' in window) await Promise.all((await caches.keys()).map(key => caches.delete(key)))
    router.push('/work')
    router.refresh()
  }

  return (
    <div className='login-screen flex min-h-[60vh] items-center justify-center'>
      <form
        onSubmit={handleSubmit}
        className='w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-sm transition-all duration-300 hover:shadow-lg hover:shadow-muted/10'
      >
        <p className='login-eyebrow'>СП / ОРГАНИЗАТОР</p><h1 className='mb-3 text-3xl font-extrabold tracking-tight'>Вход в систему</h1><p className='mb-8 text-sm text-muted-foreground'>Рады вас видеть. Введите почту и пароль.</p>
        <div className='flex flex-col gap-5'>
          <div className='flex flex-col gap-1.5'>
            <label htmlFor='email' className='text-sm font-medium text-muted-foreground'>Электронная почта</label>
            <input
              id='email'
              type='email'
              autoComplete='username'
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className='rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-muted-foreground/30 focus:ring-1 focus:ring-ring'
              placeholder='Ваша электронная почта'
            />
          </div>
          <div className='flex flex-col gap-1.5'>
            <label htmlFor='password' className='text-sm font-medium text-muted-foreground'>Пароль</label>
            <input
              id='password'
              type='password'
              autoComplete='current-password'
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className='rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-muted-foreground/30 focus:ring-1 focus:ring-ring'
              placeholder='••••••••'
            />
          </div>
          {error && <div className='rounded-lg bg-muted px-3 py-2 text-sm text-accent'>{error}</div>}
          <button
            type='submit'
            disabled={pending}
            className='mt-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-all duration-200 hover:opacity-90 disabled:opacity-50'
          >
            {pending ? 'Вход...' : 'Войти'}
          </button>
        </div>
      </form>
    </div>
  )
}
