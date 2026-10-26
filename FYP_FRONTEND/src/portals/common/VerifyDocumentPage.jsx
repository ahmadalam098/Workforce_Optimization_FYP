import { useSearchParams, useParams } from 'react-router-dom'
import Logo from '../../components/brand/Logo.jsx'
import Icon from '../../components/ui/Icon.jsx'
import Spinner from '../../components/ui/Spinner.jsx'
import { useFetch } from '../../hooks/useFetch.js'
import { verifyApi } from '../../services/documents/documentsService.js'
import { formatCurrency } from '../../utils/format.js'
import './VerifyDocumentPage.css'

const NAMES = { invoice: 'Invoice', receipt: 'Payment receipt', payout: 'Profit share receipt' }

/** The public page a document's QR opens: says whether the number and code are genuine. No sign-in, and nothing private is shown. */
function VerifyDocumentPage() {
  const { kind, number } = useParams()
  const [searchParams] = useSearchParams()
  const code = searchParams.get('c') ?? ''
  const { data, error, loading } = useFetch((signal) => verifyApi.check(kind, number, code, signal), `verify-${kind}-${number}-${code}`)
  const document = data?.document

  return (
    <main className="verify-page">
      <div className="verify-card">
        <Logo />
        <h1>Document check</h1>
        <p className="verify-card__what">
          {NAMES[kind] ?? 'Document'} <strong>{number}</strong>
        </p>

        {loading && !data ? (
          <Spinner label="Checking..." />
        ) : error && !data ? (
          <div className="verify-result verify-result--bad" role="alert">
            <Icon name="alert" size={28} />
            <strong>The check could not be done</strong>
            <span>Please try again in a moment.</span>
          </div>
        ) : data?.valid ? (
          <div className="verify-result verify-result--good" role="status">
            <Icon name="checkCircle" size={28} />
            <strong>This document is genuine</strong>
            <span>It was issued by this company.</span>
            <dl>
              {document.organization && (
                <>
                  <dt>Organization</dt>
                  <dd>{document.organization}</dd>
                </>
              )}
              {document.amount != null && (
                <>
                  <dt>Amount</dt>
                  <dd>{formatCurrency(document.amount, document.currency)}</dd>
                </>
              )}
              {document.date && (
                <>
                  <dt>Date</dt>
                  <dd>{String(document.date).slice(0, 10)}</dd>
                </>
              )}
              {document.period && (
                <>
                  <dt>Month</dt>
                  <dd>{document.period}</dd>
                </>
              )}
              {document.status && (
                <>
                  <dt>Status</dt>
                  <dd>{document.status}</dd>
                </>
              )}
            </dl>
          </div>
        ) : (
          <div className="verify-result verify-result--bad" role="alert">
            <Icon name="alert" size={28} />
            <strong>This document could not be confirmed</strong>
            <span>The number or the code does not match any document of this company. Do not rely on it.</span>
          </div>
        )}
      </div>
    </main>
  )
}

export default VerifyDocumentPage
