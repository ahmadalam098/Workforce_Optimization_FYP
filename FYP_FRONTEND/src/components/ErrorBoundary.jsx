import { Component } from 'react'
import Button from './ui/Button.jsx'

/**
 * Catches a crash inside a page so the rest of the portal (menu, header) stays on screen instead of a blank page.
 * Give it a `key` that changes with the route so the next page starts fresh.
 */
class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Kept in the browser console for debugging.
    console.error('Page crashed:', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="page">
        <section className="card">
          <div className="card__body form-stack">
            <h3 className="card__title">This page could not be shown</h3>
            <p className="cell-muted">Something went wrong while opening it. Reload the page; if it happens again, tell the developer what you were doing.</p>
            <p className="cell-muted">
              <strong>Details:</strong> {String(this.state.error?.message || this.state.error)}
            </p>
            <div>
              <Button onClick={() => window.location.reload()}>Reload page</Button>
            </div>
          </div>
        </section>
      </div>
    )
  }
}

export default ErrorBoundary
