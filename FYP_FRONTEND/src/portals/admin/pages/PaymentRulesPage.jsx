import { useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import Badge from '../../../components/ui/Badge.jsx'
import Button from '../../../components/ui/Button.jsx'
import ConfirmDialog from '../../../components/ui/ConfirmDialog.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import { exchangeRatesApi, paymentRulesApi } from '../../../services/adminService.js'
import { formatDate } from '../../../utils/format.js'
import DeleteForever from '../components/DeleteForever.jsx'
import Notice from '../components/Notice.jsx'
import PageHeader from '../components/PageHeader.jsx'
import { ExchangeRateModal, PaymentRuleModal } from '../components/PaymentRuleModals.jsx'
import { EmptyState, ErrorState } from '../components/StateBox.jsx'
import { ActiveBadge } from '../components/StatusBadge.jsx'
import { useFlashNotice } from '../../../hooks/useFlashNotice.js'

const TABS = [
  { id: 'rules', label: 'Payment rules' },
  { id: 'rates', label: 'Exchange rates' },
]

/** System-wide payment rules and the currency exchange rates used for PKR conversion. */
function PaymentRulesPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = TABS.find((item) => item.id === searchParams.get('tab'))?.id ?? 'rules'
  const [notice, setNotice] = useFlashNotice()
  const [ruleTarget, setRuleTarget] = useState(null) // null | 'new' | rule
  const [addingRate, setAddingRate] = useState(false)
  const [toggleTarget, setToggleTarget] = useState(null)

  const rules = useFetch((signal) => paymentRulesApi.list(signal), 'payment-rules')
  const rates = useFetch((signal) => exchangeRatesApi.list(signal), 'exchange-rates')

  async function handleToggle() {
    const makeActive = !toggleTarget.isActive
    await paymentRulesApi.setActive(toggleTarget.ruleId, makeActive)
    setToggleTarget(null)
    setNotice(`${toggleTarget.title} was ${makeActive ? 'activated' : 'deactivated'}.`)
    rules.reload()
  }

  return (
    <div className="page">
      <PageHeader
        title="Payment Rules"
        description="How invoices are due, how overtime is paid, and the rates used to convert currencies to PKR."
        actions={
          tab === 'rules' ? (
            <Button onClick={() => navigate('/admin/payment-rules/new')}>
              <Icon name="plus" size={18} /> Add rule
            </Button>
          ) : (
            <Button onClick={() => navigate('/admin/payment-rules/new-rate')}>
              <Icon name="plus" size={18} /> Add exchange rate
            </Button>
          )
        }
      />

      <Notice message={notice} onClose={() => setNotice('')} />

      <div className="tabs" role="tablist" aria-label="Payment settings">
        {TABS.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={`tabs__tab ${tab === item.id ? 'is-active' : ''}`} onClick={() => setSearchParams({ tab: item.id }, { replace: true })}>
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'rules' ? (
        <section className="card">
          {rules.error && !rules.data ? (
            <ErrorState error={rules.error} onRetry={rules.reload} />
          ) : !rules.data && rules.loading ? (
            <Spinner label="Loading rules..." />
          ) : rules.data.length === 0 ? (
            <EmptyState icon="settings" title="No rules" />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Rule</th>
                    <th className="num">Value</th>
                    <th>Status</th>
                    <th>
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rules.data.map((rule) => (
                    <tr key={rule.ruleId} className={rule.isActive ? '' : 'is-inactive'}>
                      <td>
                        <span className="person__name">
                          {rule.title} {rule.isSystem && <Badge tone="gold">Built-in</Badge>}
                        </span>
                        <span className="person__sub">
                          {rule.ruleKey}
                          {rule.description ? ` · ${rule.description}` : ''}
                        </span>
                      </td>
                      <td className="num">
                        <strong>{rule.value}</strong> <span className="cell-muted">{rule.unit}</span>
                      </td>
                      <td>
                        <ActiveBadge isActive={rule.isActive} />
                      </td>
                      <td>
                        <div className="row-actions">
                          <button type="button" className="icon-btn" onClick={() => setRuleTarget(rule)} aria-label={`Edit ${rule.title}`} title="Edit">
                            <Icon name="edit" size={17} />
                          </button>
                          {!rule.isSystem && (
                            <button type="button" className={`icon-btn ${rule.isActive ? 'icon-btn--danger' : ''}`} onClick={() => setToggleTarget(rule)} aria-label={`${rule.isActive ? 'Deactivate' : 'Activate'} ${rule.title}`} title={rule.isActive ? 'Deactivate' : 'Activate'}>
                              <Icon name={rule.isActive ? 'ban' : 'checkCircle'} size={17} />
                            </button>
                          )}
                          {!rule.isSystem && !rule.isActive && (
                            <DeleteForever
                              name={rule.title}
                              title="Delete rule completely?"
                              message={`${rule.title} will be removed for good. This cannot be undone.`}
                              onDelete={() => paymentRulesApi.remove(rule.ruleId)}
                              onDone={(message) => {
                                setNotice(message)
                                rules.reload()
                              }}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <section className="card">
          {rates.error && !rates.data ? (
            <ErrorState error={rates.error} onRetry={rates.reload} />
          ) : !rates.data && rates.loading ? (
            <Spinner label="Loading exchange rates..." />
          ) : rates.data.length === 0 ? (
            <EmptyState
              icon="chart"
              title="No exchange rates yet"
              text="Organizations are billed in their contract currency (for example USD) and employees are paid in PKR. Add the USD to PKR rate so payments can be converted."
              action={
                <Button onClick={() => setAddingRate(true)}>
                  <Icon name="plus" size={18} /> Add exchange rate
                </Button>
              }
            />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Pair</th>
                    <th className="num">Rate</th>
                    <th>Applies from</th>
                    <th>Added by</th>
                  </tr>
                </thead>
                <tbody>
                  {rates.data.map((rate) => (
                    <tr key={rate.rateId}>
                      <td>
                        <span className="person__name">
                          {rate.fromCurrency} → {rate.toCurrency}
                        </span>
                      </td>
                      <td className="num">
                        1 {rate.fromCurrency} = <strong>{rate.rate}</strong> {rate.toCurrency}
                      </td>
                      <td className="cell-muted cell-date">{formatDate(rate.effectiveDate)}</td>
                      <td className="cell-muted">{rate.createdBy || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {ruleTarget && (
        <PaymentRuleModal
          rule={ruleTarget === 'new' ? null : ruleTarget}
          onClose={() => setRuleTarget(null)}
          onSaved={(message) => {
            setRuleTarget(null)
            setNotice(message)
            rules.reload()
          }}
        />
      )}

      {addingRate && (
        <ExchangeRateModal
          onClose={() => setAddingRate(false)}
          onSaved={(message) => {
            setAddingRate(false)
            setNotice(message)
            rates.reload()
          }}
        />
      )}

      {toggleTarget && (
        <ConfirmDialog
          title={toggleTarget.isActive ? 'Deactivate rule?' : 'Activate rule?'}
          message={`${toggleTarget.title} will be ${toggleTarget.isActive ? 'switched off' : 'switched on'}.`}
          confirmLabel={toggleTarget.isActive ? 'Deactivate' : 'Activate'}
          danger={toggleTarget.isActive}
          onConfirm={handleToggle}
          onCancel={() => setToggleTarget(null)}
        />
      )}
    </div>
  )
}

export default PaymentRulesPage
