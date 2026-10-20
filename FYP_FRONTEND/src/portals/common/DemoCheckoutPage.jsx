import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Alert from '../../components/ui/Alert.jsx'
import Spinner from '../../components/ui/Spinner.jsx'
import { useFetch } from '../../hooks/useFetch.js'
import { gatewayDemoApi } from '../../services/documents/documentsService.js'
import { formatCurrency } from '../../utils/format.js'
import './DemoCheckoutPage.css'

const BACK_MS = 2500

/**
 * The demo payment gateway's checkout page. This is what a real gateway's hosted page (JazzCash, Easypaisa, PayFast, Stripe ...) does: show what is
 * being paid and take the payment. Here nothing is charged: the buttons only tell our server "paid", "failed" or "cancelled", exactly like a
 * gateway's confirmation would. Then the organization is sent back to its Payments page.
 */
function DemoCheckoutPage() {
  const { token } = useParams()
  const navigate = useNavigate()
  const { data, error, loading, reload } = useFetch((signal) => gatewayDemoApi.checkout(token, signal), `demo-checkout-${token}`)
  const [busy, setBusy] = useState('')
  const [problem, setProblem] = useState('')
  const [done, setDone] = useState(null)

  const finished = done ?? (data && data.status !== 'Created' ? { outcome: data.status === 'Paid' ? 'paid' : data.status === 'Cancelled' ? 'cancelled' : 'failed', checkout: data } : null)

  const outcome = finished?.outcome
  useEffect(() => {
    if (!outcome) return undefined
    const timer = setTimeout(() => navigate(`/organization/payments?online=${outcome}&token=${token}`, { replace: true }), BACK_MS)
    return () => clearTimeout(timer)
  }, [outcome, navigate, token])

  async function press(outcome) {
    setBusy(outcome)
    setProblem('')
    try {
      const result = await gatewayDemoApi.result(token, outcome)
      setDone({ outcome: outcome === 'pay' ? 'paid' : outcome === 'fail' ? 'failed' : 'cancelled', checkout: result.checkout, message: result.message })
      reload()
    } catch (err) {
      setProblem(err.message)
      setBusy('')
    }
  }

  return (
    <main className="demo-gateway">
      <div className="demo-gateway__ribbon">DEMO PAYMENT GATEWAY - no real money moves</div>
      <section className="demo-gateway__card">
        <header className="demo-gateway__head">
          <span className="demo-gateway__logo" aria-hidden="true">
            DemoPay
          </span>
          <span>Secure checkout (demo)</span>
        </header>

        {loading && !data ? (
          <Spinner label="Opening the payment page..." />
        ) : error && !data ? (
          <Alert type="error">This payment page does not exist or has expired.</Alert>
        ) : finished ? (
          <div className={`demo-gateway__result demo-gateway__result--${finished.outcome}`} role="status">
            <strong>{finished.outcome === 'paid' ? 'Payment successful' : finished.outcome === 'cancelled' ? 'Payment cancelled' : 'Payment failed'}</strong>
            {finished.checkout?.receiptNumber && <span>Receipt {finished.checkout.receiptNumber}</span>}
            {finished.outcome === 'failed' && (finished.checkout?.failureReason ?? done?.message) && <span>{finished.checkout?.failureReason ?? done?.message}</span>}
            <span className="demo-gateway__muted">Taking you back to your portal...</span>
          </div>
        ) : (
          <>
            <dl className="demo-gateway__order">
              <dt>Paying</dt>
              <dd>{data.organization}</dd>
              <dt>Invoice</dt>
              <dd>{data.invoiceNumber}</dd>
              <dt>Amount</dt>
              <dd className="demo-gateway__amount">{formatCurrency(data.amount, data.currency)}</dd>
            </dl>

            {problem && <Alert type="error">{problem}</Alert>}

            <form
              className="demo-gateway__form"
              onSubmit={(event) => {
                event.preventDefault()
                press('pay')
              }}
            >
              <label>
                Card number
                <input value="4242 4242 4242 4242" readOnly aria-readonly="true" />
              </label>
              <div className="demo-gateway__row">
                <label>
                  Expiry
                  <input value="12 / 30" readOnly aria-readonly="true" />
                </label>
                <label>
                  CVC
                  <input value="123" readOnly aria-readonly="true" />
                </label>
              </div>
              <p className="demo-gateway__muted">A test card is filled in for you. Nothing is charged.</p>
              <button type="submit" className="demo-gateway__pay" disabled={Boolean(busy)}>
                {busy === 'pay' ? 'Paying...' : `Pay ${formatCurrency(data.amount, data.currency)}`}
              </button>
            </form>

            <div className="demo-gateway__alt">
              <button type="button" onClick={() => press('fail')} disabled={Boolean(busy)}>
                Simulate a declined card
              </button>
              <button type="button" onClick={() => press('cancel')} disabled={Boolean(busy)}>
                Cancel and go back
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  )
}

export default DemoCheckoutPage
