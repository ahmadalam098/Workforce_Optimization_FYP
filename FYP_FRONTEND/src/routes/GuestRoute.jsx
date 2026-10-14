import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/useAuth.js'
import { getRoleHome } from '../constants/roles.js'
import Spinner from '../components/ui/Spinner.jsx'

/** Pages for signed-out users only (e.g. login). Signed-in users go to their dashboard. */
function GuestRoute() {
  const { user, initializing } = useAuth()
  if (initializing) return <Spinner fullPage label="Checking your session..." />
  if (user) return <Navigate to={getRoleHome(user.roleName)} replace />
  return <Outlet />
}

export default GuestRoute
