import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Spinner from '../../components/ui/Spinner.jsx'
import { organizationPaymentsApi } from '../../services/organization/organizationService.js'
import './DemoCheckoutPage.css'

/**
 * Safepay sends the organization's browser back here after paying (/pay/safepay/return/:token) or cancelling (/pay/safepay/cancel/:token).
 * Nothing is believed from the browser: the server asks Safepay how the payment ended, records it, and the organization is taken to its Payments
 * page with the result (and the receipt when it was paid).
 */
function GatewayReturnPage({ cancelled = false }) {
  const { token } = useParams()
  const navigate = useNavigate()
  const [problem, setProblem] = useState('')
  const asked = useRef(false)

  useEffect(() => {
    if (asked.current) return
    asked.current = true
    organizationPaymentsApi
      .confirmOnline(token, cancelled)
      .then((result) => navigate(`/organization/payments?online=${result.outcome}&token=${token}`, { replace: true }))
      .catch((err) => {
        if (err.status === 401) navigate('/organization/login', { replace: true })
        else setProblem(err.message)
      })
  }, [token, cancelled, navigate])

  return (
    <main className="demo-gateway">
      <section className="demo-gateway__card">
        {problem ? (
          <div className="demo-gateway__result demo-gateway__result--failed" role="alert">
            <strong>We could not check the payment</strong>
            <span>{problem}</span>
            <a href="/organization/payments">Go to your Payments page</a>
          </div>
        ) : (
          <Spinner label={cancelled ? 'Closing the payment...' : 'Checking your payment with Safepay...'} />
        )}
      </section>
    </main>
  )
}

export default GatewayReturnPage
