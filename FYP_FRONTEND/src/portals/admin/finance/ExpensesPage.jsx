import { useState } from 'react'
import { Link } from 'react-router-dom'
import Alert from '../../../components/ui/Alert.jsx'
import Badge from '../../../components/ui/Badge.jsx'
import Button from '../../../components/ui/Button.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import Pagination from '../../../components/ui/Pagination.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import { useFlashNotice } from '../../../hooks/useFlashNotice.js'
import { useFormFields } from '../../../hooks/useFormFields.js'
import { expensesApi } from '../../../services/admin/adminService.js'
import { formatCurrency, formatCurrencyWhole, formatDate, formatDateTime } from '../../../utils/format.js'
import { onlyErrors, validateDate, validateNumber, validateText } from '../../../utils/validators.js'
import DecisionModal from '../shared/DecisionModal.jsx'
import Notice from '../shared/Notice.jsx'
import PageHeader from '../shared/PageHeader.jsx'
import { EmptyState, ErrorState } from '../shared/StateBox.jsx'
import './FinanceTiles.css'

const PAGE_SIZE = 15
const today = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/** Write down one expense: the amount, the date and (only if you want) what it was for. */
function AddExpenseForm({ available, onAdded }) {
  const [busy, setBusy] = useState(false)
  const [serverError, setServerError] = useState('')
  const { form, field, checkAll, addServerErrors, reset } = useFormFields({ amount: '', expenseDate: today(), description: '' }, (values) =>
    onlyErrors({
      amount: validateNumber(values.amount, { label: 'Amount', positive: true, decimals: 2, max: 100000000000 }) || (Number(values.amount) > available + 0.004 ? `You only have ${formatCurrency(Math.max(0, available), 'PKR')}. An expense cannot be more than the money you have.` : ''),
      expenseDate: validateDate(values.expenseDate, { label: 'Date', notInFuture: true }),
      description: validateText(values.description, { label: 'Description', required: false, max: 255 }),
    }),
  )

  async function submit(event) {
    event.preventDefault()
    if (!checkAll()) {
      setServerError('Please correct the highlighted fields.')
      return
    }
    setBusy(true)
    setServerError('')
    try {
      const result = await expensesApi.add({ amount: Number(form.amount), expenseDate: form.expenseDate, description: form.description.trim() || undefined })
      reset?.()
      onAdded(result?.message || 'Expense added.')
    } catch (problem) {
      addServerErrors(problem.fieldErrors)
      setServerError(problem.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <div className="card__header">
        <h3 className="card__title">Add an expense</h3>
      </div>
      <form className="card__body form-stack" onSubmit={submit} noValidate>
        {serverError && <Alert type="error">{serverError}</Alert>}
        <p>
          Money you have now: <strong>{formatCurrency(available, 'PKR')}</strong>
          <span className="cell-muted"> (what the organizations paid, minus the expenses and what was sent to the owners). An expense cannot be more than this.</span>
        </p>
        <div className="form-grid">
          <TextField label="Amount (PKR)" required type="number" inputMode="decimal" min="0.01" step="0.01" max={Math.max(0, available)} placeholder="e.g. 25000" {...field('amount')} />
          <TextField label="Date" required type="date" max={today()} {...field('expenseDate')} />
        </div>
        <TextField label="Description (optional)" maxLength={255} placeholder="What was the money spent on? You can leave this empty." autoComplete="off" {...field('description')} />
        <div>
          <Button type="submit" loading={busy}>
            <Icon name="plus" size={17} /> Add expense
          </Button>
        </div>
        <p className="cell-muted">The amount is taken off the money that is left. What is left after the expenses is the profit, which you send to the business owners from the Balance Sheet.</p>
      </form>
    </section>
  )
}

/** Admin: the company's expenses. This is the only money going out; there is no salary or payroll in the system. */
function ExpensesPage() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [voiding, setVoiding] = useState(null)
  const [notice, setNotice] = useFlashNotice()
  const params = { from, to, includeVoided: true, page, pageSize: PAGE_SIZE }
  const { data, error, loading, reload } = useFetch((signal) => expensesApi.list(params, signal), JSON.stringify(params))
  const items = data?.items ?? []

  return (
    <div className="page">
      <PageHeader title="Expenses" description="Write down what the company spent. Every expense is taken off the money that is left to share with the business owners." />
      <Notice message={notice} onClose={() => setNotice('')} />

      {data && (
        <section className="finance-tiles" aria-label="Money">
          <article className="card finance-tile">
            <p className="finance-tile__label">Expenses{from || to ? ' in this period' : ''}</p>
            <p className="finance-tile__value">{formatCurrencyWhole(data.totalPkr, 'PKR')}</p>
            <p className="finance-tile__caption">{data.total} entr{data.total === 1 ? 'y' : 'ies'}</p>
          </article>
          <article className="card finance-tile finance-tile--gold">
            <p className="finance-tile__label">Money you have now</p>
            <p className="finance-tile__value">{formatCurrencyWhole(data.balance.available, 'PKR')}</p>
            <p className="finance-tile__caption">
              received {formatCurrencyWhole(data.balance.received, 'PKR')} − expenses {formatCurrencyWhole(data.balance.expenses, 'PKR')} − sent {formatCurrencyWhole(data.balance.sent, 'PKR')} · <Link to="/admin/balance-sheet">Balance Sheet</Link>
            </p>
          </article>
        </section>
      )}

      <AddExpenseForm
        available={data?.balance.available ?? 0}
        onAdded={(message) => {
          setNotice(message)
          setPage(1)
          reload()
        }}
      />

      <section className="card">
        <div className="card__header">
          <h3 className="card__title">All expenses</h3>
        </div>
        <div className="toolbar">
          <TextField className="toolbar__filter" label="From" type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1) }} />
          <TextField className="toolbar__filter" label="To" type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1) }} />
        </div>
        {error && !data ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !data && loading ? (
          <Spinner label="Loading expenses..." />
        ) : items.length === 0 ? (
          <EmptyState icon="inbox" title="No expenses" text={from || to ? 'Try another period.' : 'Nothing has been written down yet. Add the first expense above.'} />
        ) : (
          <>
            <div className="table-wrap" aria-busy={loading}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th className="num">Amount</th>
                    <th>What for</th>
                    <th>Written by</th>
                    <th>
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((expense) => (
                    <tr key={expense.expenseId} className={expense.voided ? 'is-inactive' : ''}>
                      <td className="cell-muted cell-date">{formatDate(expense.expenseDate)}</td>
                      <td className="num">
                        <strong style={expense.voided ? { textDecoration: 'line-through' } : undefined}>{formatCurrency(expense.amountPkr, 'PKR')}</strong>
                      </td>
                      <td>
                        {expense.description || <span className="cell-muted">—</span>}
                        {expense.voided && <span className="person__sub">Voided {formatDateTime(expense.voidedAt)}: {expense.voidReason}</span>}
                      </td>
                      <td className="cell-muted">{expense.createdBy || '—'}</td>
                      <td>
                        <div className="row-actions">
                          {expense.voided ? (
                            <Badge tone="neutral">Voided</Badge>
                          ) : expense.canVoid ? (
                            <Button variant="secondary" onClick={() => setVoiding(expense)}>
                              Void
                            </Button>
                          ) : (
                            <span className="cell-muted" title="It was already counted when the profit was sent to the owners">
                              Counted
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />
          </>
        )}
      </section>

      {voiding && (
        <DecisionModal
          title="Void this expense?"
          description={`The expense of ${formatCurrency(voiding.amountPkr, 'PKR')} is taken back and the money is counted as left again. The entry stays in the list as voided.`}
          label="Reason"
          required
          danger
          confirmLabel="Void expense"
          onSubmit={async (reason) => {
            const result = await expensesApi.void(voiding.expenseId, reason)
            setVoiding(null)
            setNotice(result?.message || 'Expense voided.')
            reload()
          }}
          onClose={() => setVoiding(null)}
        />
      )}
    </div>
  )
}

export default ExpensesPage
