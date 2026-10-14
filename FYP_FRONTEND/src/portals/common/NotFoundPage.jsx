import { Link } from 'react-router-dom'
import Logo from '../../components/brand/Logo.jsx'
import './NotFoundPage.css'

function NotFoundPage() {
  return (
    <main className="not-found">
      <Logo tone="dark" />
      <p className="not-found__code">404</p>
      <h1 className="not-found__title">Page not found</h1>
      <p className="not-found__text">The page you are looking for doesn't exist or has been moved.</p>
      <Link to="/" className="not-found__link">
        Go to home
      </Link>
    </main>
  )
}

export default NotFoundPage
