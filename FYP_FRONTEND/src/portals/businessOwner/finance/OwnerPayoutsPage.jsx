import Spinner from '../../../components/ui/Spinner.jsx'
import LinkButton from '../../../components/ui/LinkButton.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import { ownerFinanceApi } from '../../../services/businessOwner/businessOwnerService.js'
import { formatCurrency, formatCurrencyWhole, formatDateTime } from '../../../utils/format.js'
import PageHeader from '../../admin/shared/PageHeader.jsx'
import { EmptyState, ErrorState } from '../../admin/shared/StateBox.jsx'
import '../../admin/finance/FinanceTiles.css'

/** Business Owner: the profit shares the admin sent to me, each with its receipt. */
function OwnerPayoutsPage() {
  const { data, error, loading, reload } = useFetch((signal) => ownerFinanceApi.payouts(signal), 'owner-payouts')

  return (
    <div className="page">
      <PageHeader title="My Payouts" description="The profit the admin sent to you. Open a receipt to see how your share was worked out; you can print it." />

      {error && !data ? (
        <div className="card">
          <ErrorState error={error} onRetry={reload} />
        </div>
      ) : !data && loading ? (
        <Spinner label="Loading your payouts..." />
      ) : (
        <>
          <section className="finance-tiles" aria-label="Totals">
            <article className="card finance-tile finance-tile--gold">
              <p className="finance-tile__label">Received in total</p>
              <p className="finance-tile__value">{formatCurrencyWhole(data.totals.allTimePkr, 'PKR')}</p>
              <p className="finance-tile__caption">
                {data.totals.count} payout{data.totals.count === 1 ? '' : 's'}
              </p>
            </article>
            <article className="card finance-tile">
              <p className="finance-tile__label">This year</p>
              <p className="finance-tile__value">{formatCurrencyWhole(data.totals.thisYearPkr, 'PKR')}</p>
            </article>
            <article className="card finance-tile">
              <p className="finance-tile__label">This month</p>
              <p className="finance-tile__value">{formatCurrencyWhole(data.totals.thisMonthPkr, 'PKR')}</p>
            </article>
          </section>

          <section className="card">
            <div className="card__header">
              <h3 className="card__title">Payouts</h3>
            </div>
            {data.items.length === 0 ? (
              <EmptyState icon="chart" title="Nothing sent to you yet" text="When the admin sends the profit to the business owners, your share and its receipt appear here." />
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Receipt</th>
                      <th>For</th>
                      <th>Sent on</th>
                      <th className="num">Your share</th>
                      <th>Shared between</th>
                      <th>
                        <span className="visually-hidden">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((payout) => (
                      <tr key={payout.payoutId}>
                        <td>
                          <strong>{payout.number}</strong>
                        </td>
                        <td>{payout.label}</td>
                        <td className="cell-muted cell-date">{formatDateTime(payout.sentAt)}</td>
                        <td className="num">
                          <strong>{formatCurrency(payout.amountPkr, 'PKR')}</strong>
                        </td>
                        <td className="cell-muted">
                          {payout.owners} owner{payout.owners === 1 ? '' : 's'}
                        </td>
                        <td>
                          <div className="row-actions">
                            <LinkButton to={`/owner/documents/payout/${payout.payoutId}`}>
                              <Icon name="file" size={16} /> Receipt
                            </LinkButton>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

export default OwnerPayoutsPage
