import { useState } from 'react'
import { Link } from 'react-router-dom'
import Alert from '../../../components/ui/Alert.jsx'
import Button from '../../../components/ui/Button.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import { BalanceTiles, MonthReceived, MonthlySheet, Transactions } from '../../../components/finance/BalanceSheetParts.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import { useFlashNotice } from '../../../hooks/useFlashNotice.js'
import { balanceSheetApi } from '../../../services/admin/adminService.js'
import { formatCurrency, formatCurrencyWhole, formatDateTime } from '../../../utils/format.js'
import DecisionModal from '../shared/DecisionModal.jsx'
import Notice from '../shared/Notice.jsx'
import PageHeader from '../shared/PageHeader.jsx'
import { EmptyState, ErrorState } from '../shared/StateBox.jsx'
import './FinanceTiles.css'

/** What would happen if the profit were sent now, and the button to do it. */
function SendCard({ preview, onSend }) {
  return (
    <section className="card">
      <div className="card__header">
        <h3 className="card__title">Send the profit to the business owners</h3>
      </div>
      <div className="card__body form-stack">
        {!preview.canSend ? (
          <Alert type="info">{preview.reason}</Alert>
        ) : (
          <>
            <p>
              <strong>{formatCurrencyWhole(preview.available, 'PKR')}</strong> is left after the expenses. Sending it shares it equally between the {preview.owners.length} active business owner{preview.owners.length === 1 ? '' : 's'}.
              Each owner gets a notification and a receipt.
            </p>
            <ul className="call-contacts" aria-label="Each owner's share">
              {preview.owners.map((owner) => (
                <li key={owner.userId} className="call-contact">
                  <span className="call-contact__text">
                    <strong>{owner.name}</strong>
                  </span>
                  <strong>{formatCurrency(owner.sharePkr, 'PKR')}</strong>
                </li>
              ))}
            </ul>
          </>
        )}
        <div>
          <Button onClick={onSend} disabled={!preview.canSend}>
            <Icon name="send" size={17} /> Send to the owners
          </Button>
        </div>
      </div>
    </section>
  )
}

/** Everything that was sent to the owners before, each with the receipt of each owner. */
function Settlements({ items }) {
  return (
    <section className="card">
      <div className="card__header">
        <h3 className="card__title">Sent to the owners</h3>
      </div>
      {items.length === 0 ? (
        <EmptyState icon="send" title="Nothing sent yet" text="When you send the profit to the owners, each time is listed here with every owner's receipt." />
      ) : (
        <div className="card__body form-stack">
          {items.map((settlement) => (
            <div key={settlement.settlementId} className="form-stack">
              <p>
                <strong>{settlement.label}</strong> · {formatCurrency(settlement.amountPkr, 'PKR')} to {settlement.ownerCount} owner{settlement.ownerCount === 1 ? '' : 's'} · <span className="cell-muted">{formatDateTime(settlement.settledAt)}</span>
              </p>
              {settlement.note && <p className="cell-muted">{settlement.note}</p>}
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Owner</th>
                      <th className="num">Share</th>
                      <th>Receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settlement.payouts.map((payout) => (
                      <tr key={payout.payoutId}>
                        <td>{payout.ownerName}</td>
                        <td className="num">{formatCurrency(payout.amountPkr, 'PKR')}</td>
                        <td>
                          <Link to={`/admin/documents/payout/${payout.payoutId}`}>{payout.number}</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/** Admin: the balance sheet of the company, and sending the profit to the business owners. */
function BalanceSheetPage() {
  const [year, setYear] = useState(undefined)
  const [month, setMonth] = useState(undefined)
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useFlashNotice()
  const { data, error, loading, reload } = useFetch((signal) => balanceSheetApi.get(year, month, signal), `admin-balance-sheet-${year ?? 'now'}-${month ?? 'now'}`)
  const [txKey, setTxKey] = useState(0)

  return (
    <div className="page">
      <PageHeader title="Balance Sheet" description="What the organizations paid, what was spent, what was sent to the business owners and what is still left. All in PKR." />
      <Notice message={notice} onClose={() => setNotice('')} />

      {error && !data ? (
        <div className="card">
          <ErrorState error={error} onRetry={reload} />
        </div>
      ) : !data && loading ? (
        <Spinner label="Loading the balance sheet..." />
      ) : (
        <>
          <BalanceTiles balance={data.balance} />
          <MonthReceived month={data.month} year={data.sheet.year} onMonth={setMonth} />
          <SendCard preview={data.preview} onSend={() => setSending(true)} />
          <MonthlySheet sheet={data.sheet} onYear={(next) => { setYear(next); setMonth(undefined) }} />
          <Settlements items={data.settlements} />
          <Transactions key={txKey} cacheKey={`admin-tx-${txKey}`} load={(page, signal) => balanceSheetApi.transactions(page, signal)} />
        </>
      )}

      {sending && data && (
        <DecisionModal
          title="Send the profit to the business owners?"
          description={`${formatCurrency(data.preview.available, 'PKR')} is shared equally between ${data.preview.owners.length} owner${data.preview.owners.length === 1 ? '' : 's'}. This cannot be undone: each owner gets a notification and a receipt.`}
          label="Note (optional)"
          confirmLabel="Send to the owners"
          onSubmit={async (note) => {
            const result = await balanceSheetApi.send({ note: note || undefined })
            setSending(false)
            setNotice(result?.message || 'Sent.')
            setTxKey((key) => key + 1)
            reload()
          }}
          onClose={() => setSending(false)}
        />
      )}
    </div>
  )
}

export default BalanceSheetPage
