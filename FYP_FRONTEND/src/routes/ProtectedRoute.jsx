import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/useAuth.js'
import { getRoleHome } from '../constants/roles.js'
import Spinner from '../components/ui/Spinner.jsx'

/** Allows access only to signed-in users whose role is in `roles`. */
function ProtectedRoute({ roles }) {
  const { user, initializing } = useAuth()
  const location = useLocation()

  if (initializing) return <Spinner fullPage label="Checking your session..." />

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  const allowed = roles.some((role) => role.toLowerCase() === user.roleName?.toLowerCase())
  if (!allowed) {
    return <Navigate to={getRoleHome(user.roleName)} replace />
  }

  return <Outlet />
}

export default ProtectedRoute
