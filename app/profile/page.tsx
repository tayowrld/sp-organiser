export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getUser } from '../auth/actions'
import { IkonsIcon } from '../components/IkonsIcon'
import { getDepartment } from '../people'
import userIcon from '@ikions/icons/nodes/user'

export default async function ProfilePage() {
  const user = await getUser()
  if (!user) redirect('/login')

  return (
    <div className='section-page section-page-narrow'>
      <h1 className='text-3xl font-extrabold tracking-tight'>Профиль</h1>
      <div className='flex flex-col gap-5 rounded-2xl border border-border bg-card p-8 shadow-sm'>
        <div className='flex items-center gap-4'>
          <div className='flex h-14 w-14 items-center justify-center rounded-full border border-border bg-background'>
            <IkonsIcon data={userIcon} variant='filled' size={28} />
          </div>
          <div>
            <div className='text-lg font-semibold'>{user.name}</div>
            <div className='text-sm text-muted-foreground'>{user.email}</div>
          </div>
        </div>
        <div className='flex items-center gap-2 rounded-lg border border-border/50 bg-background px-3 py-2 text-sm'>
          <span className='text-muted-foreground'>Права доступа:</span>
          <span className='font-medium capitalize'>{user.is_superadmin ? 'Главный администратор' : user.is_admin ? 'Администратор' : 'Пользователь'}</span>
        </div>
        <div className='flex items-center gap-2 rounded-lg border border-border/50 bg-background px-3 py-2 text-sm'><span className='text-muted-foreground'>Отдел:</span><span>{getDepartment(user)?.name || 'Не назначен'}</span></div>
      </div>
    </div>
  )
}
