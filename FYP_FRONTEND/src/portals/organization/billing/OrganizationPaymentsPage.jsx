import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Alert from '../../../components/ui/Alert.jsx'
import Button from '../../../components/ui/Button.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import Modal from '../../../components/ui/Modal.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import TextArea from '../../../components/ui/TextArea.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import SubmissionsTable from '../../../components/payments/SubmissionsTable.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import { useFlashNotice } from '../../../hooks/useFlashNotice.js'
import { useFormFields } from '../../../hooks/useFormFields.js'
import { organizationPaymentsApi } from '../../../services/organization/organizationService.js'
import { formatCurrency, formatCurrencyWhole, formatDate } from '../../../utils/format.js'
import { onlyErrors, validateChoice, validateNumber, validateText } from '../../../utils/validators.js'
import PayOnlineModal from './PayOnlineModal.jsx'
import '../../admin/finance/FinanceTiles.css'
import Notice from '../../admin/shared/Notice.jsx'
import PageHeader from '../../admin/shared/PageHeader.jsx'
import { EmptyState, ErrorState } from '../../admin/shared/StateBox.jsx'

const METHODS = ['Bank transfer', 'Cash', 'Cheque', 'Online payment', 'Other'].map((value) => ({ value, label: value }))
const today = () => new Date().toISOString().slice(0, 10)
const MAX_BYTES = 5 * 1024 * 1024

/** The form that tells the company about a payment. `invoice` (optional) is the invoice to start with. */
export function PayInvoiceModal({ payable, invoice, onClose, onDone }) {
  const first = invoice ?? payable[0]
  const { form, field, checkAll, addServerErrors } = useFormFields(
    { invoiceId: first ? String(first.invoiceId) : '', amount: first ? String(first.payable) : '', method: 'Bank transfer', reference: '', paidOn: today(), note: '' },
    (values) => {
      const chosen = payable.find((item) => String(item.invoiceId) === values.invoiceId)
      return onlyErrors({
        invoiceId: values.invoiceId ? '' : 'Choose the invoice you paid.',
        amount: validateNumber(values.amount, { label: 'The amount', min: 0.01, max: chosen ? chosen.payable : 1000000000, decimals: 2, positive: true }),
        method: validateChoice(values.method, METHODS, 'The way you paid'),
        reference: values.method !== 'Cash' ? validateText(values.reference, { label: 'The reference', min: 3, max: 100 }) : '',
        paidOn: !values.paidOn ? 'Choose the payment date.' : values.paidOn > today() ? 'The payment date cannot be in the future.' : '',
      })
    },
  )
  const [file, setFile] = useState(null)
  const [fileError, setFileError] = useState('')
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const chosen = payable.find((item) => String(item.invoiceId) === form.invoiceId)
  const invoiceOptions = payable.map((item) => ({ value: String(item.invoiceId), label: `${item.invoiceNumber} · ${formatCurrency(item.payable, item.currency)} to pay${item.overdue ? ' (overdue)' : ''}` }))

  function pickFile(event) {
    const chosenFile = event.target.files?.[0] ?? null
    setFileError(chosenFile && chosenFile.size > MAX_BYTES ? 'The file is too big. Use one under 5 MB.' : '')
    setFile(chosenFile)
  }

  async function submit(event) {
    event.preventDefault()
    if (!checkAll() || fileError) {
      setServerError('Please correct the highlighted fields.')
      return
    }
    setSubmitting(true)
    setServerError('')
    try {
      const data = new FormData()
      data.append('invoiceId', form.invoiceId)
      data.append('amount', form.amount)
      data.append('method', form.method)
      if (form.reference.trim()) data.append('reference', form.reference.trim())
      data.append('paidOn', form.paidOn)
      if (form.note.trim()) data.append('note', form.note.trim())
      if (file) data.append('file', file)
      const result = await organizationPaymentsApi.submit(data)
      onDone(result?.message || 'Your payment notice was sent.')
    } catch (problem) {
      addServerErrors(problem.fieldErrors)
      if (problem.fieldErrors?.file) setFileError(problem.fieldErrors.file)
      setServerError(problem.message)
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="Tell us about a payment"
      subtitle="After you pay, send the details here. Your manager checks them, the admin approves, and you get the receipt."
      size="lg"
      onClose={onClose}
      busy={submitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="pay-invoice-form" loading={submitting}>
            Send payment notice
          </Button>
        </>
      }
    >
      <form id="pay-invoice-form" onSubmit={submit} noValidate className="form-stack">
        {serverError && <Alert type="error">{serverError}</Alert>}
        <SelectField
          label="Invoice you paid"
          required
          options={invoiceOptions}
          {...field('invoiceId')}
          onChange={(event) => {
            const next = payable.find((item) => String(item.invoiceId) === event.target.value)
            field('invoiceId').onChange(event)
            if (next) field('amount').onChange({ target: { value: String(next.payable), type: 'text' } })
          }}
        />
        <div className="form-grid">
          <TextField label={`Amount paid${chosen ? ` (${chosen.currency})` : ''}`} required inputMode="decimal" hint={chosen ? `At most ${formatCurrency(chosen.payable, chosen.currency)}.` : undefined} {...field('amount')} />
          <TextField label="Payment date" required type="date" max={today()} {...field('paidOn')} />
          <SelectField label="How did you pay?" required options={METHODS} {...field('method')} />
          <TextField label={form.method === 'Cash' ? 'Reference (optional)' : 'Reference'} required={form.method !== 'Cash'} maxLength={100} hint="The transaction id, cheque number or receipt number." {...field('reference')} />
        </div>
        <div>
          <label className="field__label" htmlFor="pay-proof" style={{ display: 'block', marginBottom: '0.35rem' }}>
            Proof of payment (optional)
          </label>
          <input id="pay-proof" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={pickFile} />
          <p className="cell-muted" style={{ margin: '0.25rem 0 0' }}>A photo or screenshot of the receipt, or a PDF. Up to 5 MB.</p>
          {fileError && (
            <p className="field-error" role="alert">
              {fileError}
            </p>
          )}
        </div>
        <TextArea label="Note (optional)" rows={2} maxLength={255} {...field('note')} />
      </form>
    </Modal>
  )
}

/** Organization: tell the company you paid (with a proof), and follow each notice: your manager checks it, the admin approves it, and the receipt appears here. */
function OrganizationPaymentsPage() {
  const [paying, setPaying] = useState(false)
  const [payingOnline, setPayingOnline] = useState(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const [notice, setNotice] = useFlashNotice()
  const [problem, setProblem] = useState('')
  const { data: payable, reload: reloadPayable } = useFetch((signal) => organizationPaymentsApi.payable(signal), 'organization-payable')
  const { data, error, loading, reload } = useFetch((signal) => organizationPaymentsApi.submissions(signal), 'organization-submissions')
  const { data: options } = useFetch((signal) => organizationPaymentsApi.onlineOptions(signal), 'organization-online-options')
  const { data: online, reload: reloadOnline } = useFetch((signal) => organizationPaymentsApi.onlineList(signal), 'organization-online-list')
  const rows = data ?? []
  const toPay = payable ?? []

  // The gateway sent the organization back: say how it went (and show the receipt).
  const backToken = searchParams.get('token')
  const backOutcome = searchParams.get('online')
  useEffect(() => {
    if (!backToken || !backOutcome) return
    let cancelled = false
    organizationPaymentsApi
      .onlineStatus(backToken)
      .then((status) => {
        if (cancelled) return
        setNotice(status.status === 'Paid' ? `Payment received. Your receipt is ${status.receiptNumber}.` : status.status === 'Cancelled' ? 'The payment was cancelled. Nothing was charged.' : `The payment did not go through. ${status.failureReason ?? ''} You can try again.`)
      })
      .catch(() => {})
      .finally(() => {
        if (cancelled) return
        setSearchParams({}, { replace: true })
        reload()
        reloadPayable()
        reloadOnline()
      })
    return () => {
      cancelled = true
    }
  }, [backToken, backOutcome]) // eslint-disable-line react-hooks/exhaustive-deps

  function refresh() {
    reload()
    reloadPayable()
  }

  async function withdraw(row) {
    setProblem('')
    try {
      const result = await organizationPaymentsApi.withdraw(row.submissionId)
      setNotice(result?.message || 'Withdrawn.')
      refresh()
    } catch (err) {
      setProblem(err.message)
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Payments"
        description="Paid an invoice? Tell us here with the reference and a proof. Your manager checks it, the admin approves it, and your receipt appears below."
        actions={
          <Button onClick={() => setPaying(true)} disabled={toPay.length === 0}>
            <Icon name="plus" size={18} /> Tell us about a payment
          </Button>
        }
      />
      <Notice message={notice} onClose={() => setNotice('')} />
      {problem && (
        <Alert type="error" onClose={() => setProblem('')}>
          {problem}
        </Alert>
      )}

      {payable && (
        <section className="finance-tiles" aria-label="To pay">
          {toPay.length === 0 ? (
            <article className="card finance-tile">
              <p className="finance-tile__label">To pay</p>
              <p className="finance-tile__value">—</p>
              <p className="finance-tile__caption">Nothing is waiting to be paid</p>
            </article>
          ) : (
            Object.entries(
              toPay.reduce((sums, item) => {
                sums[item.currency] = (sums[item.currency] ?? 0) + item.balance
                return sums
              }, {}),
            ).map(([currency, amount]) => (
              <article className={`card finance-tile ${toPay.some((item) => item.currency === currency && item.overdue) ? 'finance-tile--danger' : ''}`} key={currency}>
                <p className="finance-tile__label">To pay ({currency})</p>
                <p className="finance-tile__value">{formatCurrencyWhole(amount, currency)}</p>
                <p className="finance-tile__caption">
                  {toPay.filter((item) => item.currency === currency).length} invoice(s){toPay.some((item) => item.currency === currency && item.overdue) ? ' · some overdue' : ''}
                </p>
              </article>
            ))
          )}
        </section>
      )}

      {toPay.length > 0 && (
        <section className="card">
          <div className="card__header">
            <h3 className="card__title">Invoices to pay</h3>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Due</th>
                  <th className="num">Balance</th>
                  <th>
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {toPay.map((item) => (
                  <tr key={item.invoiceId}>
                    <td>
                      <strong>{item.invoiceNumber}</strong>
                    </td>
                    <td className="cell-muted">
                      {formatDate(item.dueDate)} {item.overdue && <span style={{ color: 'var(--danger-text, #a02a1d)' }}>· overdue</span>}
                    </td>
                    <td className="num">{formatCurrency(item.balance, item.currency)}</td>
                    <td>
                      <div className="row-actions">
                        {options?.enabled && <Button onClick={() => setPayingOnline(item)}>Pay online</Button>}
                        <Button variant="secondary" onClick={() => setPaying(item)}>
                          I paid another way
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card">
        <div className="card__header">
          <h3 className="card__title">Your payment notices</h3>
        </div>
        {error && !data ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !data && loading ? (
          <Spinner label="Loading..." />
        ) : rows.length === 0 ? (
          <EmptyState icon="file" title="No payment notices yet" text="When you tell us about a payment, you can follow it here." />
        ) : (
          <SubmissionsTable
            rows={rows}
            showOrganization={false}
            invoiceLink={(row) => `/organization/invoices/${row.invoiceId}`}
            receiptLink={(row) => `/organization/documents/receipt/${row.paymentId}`}
            actions={(row) =>
              row.status === 'Pending' ? (
                <Button variant="secondary" onClick={() => withdraw(row)}>
                  Withdraw
                </Button>
              ) : null
            }
          />
        )}
      </section>

      {online && online.length > 0 && (
        <section className="card">
          <div className="card__header">
            <h3 className="card__title">Your online payments</h3>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th className="num">Amount</th>
                  <th>When</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {online.map((row) => (
                  <tr key={row.token}>
                    <td>
                      <Link to={`/organization/invoices/${row.invoiceId}`}>{row.invoiceNumber}</Link>
                    </td>
                    <td className="num">{formatCurrency(row.amount, row.currency)}</td>
                    <td className="cell-muted">{formatDate(row.createdAt)}</td>
                    <td>
                      {row.status === 'Paid' ? (
                        <Link to={`/organization/documents/receipt/${row.paymentId}`}>Paid · receipt</Link>
                      ) : row.status === 'Created' ? (
                        <Link to={`/pay/demo/${row.token}`}>Waiting - continue</Link>
                      ) : (
                        <span className="cell-muted">{row.status}{row.failureReason ? ` · ${row.failureReason}` : ''}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {payingOnline && <PayOnlineModal invoice={payingOnline} demo={options?.demo} onClose={() => setPayingOnline(null)} />}

      {paying && (
        <PayInvoiceModal
          payable={toPay}
          invoice={typeof paying === 'object' ? paying : undefined}
          onClose={() => setPaying(false)}
          onDone={(message) => {
            setPaying(false)
            setNotice(message)
            refresh()
          }}
        />
      )}
    </div>
  )
}

export default OrganizationPaymentsPage
