import { getUser, logout } from '../../auth/actions'
import NavigationBar from './index'

export default async function NavigationBarWrapper() {
  const user = await getUser()
  return <NavigationBar user={user} onLogout={logout} />
}
