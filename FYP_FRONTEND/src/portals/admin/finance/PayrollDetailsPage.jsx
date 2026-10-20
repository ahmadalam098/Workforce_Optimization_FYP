import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import Button from '../../../components/ui/Button.jsx'
import ConfirmDialog from '../../../components/ui/ConfirmDialog.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import LinkButton from '../../../components/ui/LinkButton.jsx'
import { payrollApi } from '../../../services/admin/adminService.js'
import { formatCurrency, formatDate, formatMonth } from '../../../utils/format.js'
import Notice from '../shared/Notice.jsx'
import { PayrollItemModal } from './PayrollModals.jsx'
import { EmptyState, ErrorState } from '../shared/StateBox.jsx'
import WorkflowBadge from '../shared/WorkflowBadge.jsx'
import './FinanceTiles.css'

function PayrollDetailsPage() {
  const { payrollId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [notice, setNotice] = useState(location.state?.message ?? '')
  const [itemTarget, setItemTarget] = useState(null)
  const [confirm, setConfirm] = useState(null) // 'refresh' | 'approve' | 'pay' | 'delete'

  const { data: run, error, loading, reload } = useFetch((signal) => payrollApi.get(payrollId, signal), `payroll-${payrollId}`)

  const back = (
    <Link className="back-link" to="/admin/payroll">
      <Icon name="arrowLeft" size={16} /> Back to Payroll
    </Link>
  )

  if (!run && loading) {
    return (
      <div className="page">
        {back}
        <Spinner label="Loading payroll..." />
      </div>
    )
  }

  if (!run) {
    return (
      <div className="page">
        {back}
        <div className="card">
          <ErrorState error={error} onRetry={reload} />
        </div>
      </div>
    )
  }

  const isDraft = run.status === 'Draft'
  const monthLabel = formatMonth(run.periodYear, run.periodMonth)

  const ACTIONS = {
    refresh: {
      title: 'Refresh overtime?',
      message: 'Overtime hours and amounts are taken again from the approved entries of this month. Your adjustments are kept.',
      label: 'Refresh',
      run: () => payrollApi.refreshOvertime(run.payrollId),
    },
    approve: {
      title: 'Approve payroll?',
      message: `${monthLabel} will be locked at ${formatCurrency(run.totalPkr, 'PKR')} for ${run.employeeCount} employees. It can no longer be edited.`,
      label: 'Approve',
      run: () => payrollApi.approve(run.payrollId),
    },
    pay: {
      title: 'Mark as paid?',
      message: `Confirm that the salaries of ${monthLabel} (${formatCurrency(run.totalPkr, 'PKR')}) have been paid out.`,
      label: 'Mark as paid',
      run: () => payrollApi.markPaid(run.payrollId),
    },
    delete: {
      title: 'Delete draft?',
      message: `The draft payroll of ${monthLabel} will be deleted. You can generate it again afterwards.`,
      label: 'Delete',
      danger: true,
      run: () => payrollApi.remove(run.payrollId),
    },
  }
  const active = confirm ? ACTIONS[confirm] : null

  async function handleConfirm() {
    const result = await active.run()
    if (confirm === 'delete') {
      navigate('/admin/payroll', { replace: true })
      return
    }
    setConfirm(null)
    setNotice(result?.message || 'Done.')
    reload()
  }

  return (
    <div className="page">
      {back}
      <Notice message={notice} onClose={() => setNotice('')} />

      <section className="card hero-card">
        <div className="hero-card__main">
          <h2 className="hero-card__title">Payroll · {monthLabel}</h2>
          <p className="hero-card__sub">
            {run.employeeCount} employees · created {formatDate(run.createdAt)}
            {run.approvedAt ? ` · approved ${formatDate(run.approvedAt)}` : ''}
            {run.paidAt ? ` · paid ${formatDate(run.paidAt)}` : ''}
          </p>
          <div className="hero-card__badges">
            <WorkflowBadge status={run.status} />
          </div>
        </div>
        <div className="hero-card__actions">
          <LinkButton to={`/admin/documents/payroll/${run.payrollId}`}>
            <Icon name="file" size={17} /> Payroll sheet
          </LinkButton>
          {isDraft && (
            <>
              <Button onClick={() => setConfirm('approve')}>
                <Icon name="checkCircle" size={17} /> Approve
              </Button>
              <Button variant="secondary" onClick={() => setConfirm('refresh')}>
                <Icon name="refresh" size={17} /> Refresh overtime
              </Button>
              <Button variant="secondary" onClick={() => setConfirm('delete')}>
                <Icon name="close" size={17} /> Delete draft
              </Button>
            </>
          )}
          {run.status === 'Approved' && (
            <Button onClick={() => setConfirm('pay')}>
              <Icon name="checkCircle" size={17} /> Mark as paid
            </Button>
          )}
        </div>
      </section>

      <section className="finance-tiles" aria-label="Totals">
        <article className="card finance-tile finance-tile--gold">
          <p className="finance-tile__label">Total payroll</p>
          <p className="finance-tile__value">{formatCurrency(run.totalPkr, 'PKR')}</p>
          <p className="finance-tile__caption">all currencies converted to PKR at the rate stored with each line</p>
        </article>
      </section>

      <section className="card">
        <div className="card__header">
          <h3 className="card__title">Employees</h3>
        </div>
        {run.items.length === 0 ? (
          <EmptyState icon="users" title="No lines" />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th className="num">Salary</th>
                  <th className="num">Overtime</th>
                  <th className="num">Adjustment</th>
                  <th className="num">Total</th>
                  <th className="num">In PKR</th>
                  {isDraft && (
                    <th>
                      <span className="visually-hidden">Actions</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {run.items.map((item) => (
                  <tr key={item.itemId}>
                    <td>
                      <Link className="person__name" to={`/admin/employees/${item.employeeId}`}>
                        {item.employeeName}
                      </Link>
                      {item.currency !== 'PKR' && <span className="person__sub">1 {item.currency} = {item.exchangeRate} PKR</span>}
                      <Link className="person__sub" to={`/admin/documents/payslip/${item.itemId}`}>
                        Salary slip
                      </Link>
                    </td>
                    <td className="num">{formatCurrency(item.baseSalary, item.currency)}</td>
                    <td className="num">
                      {formatCurrency(item.overtimeAmount, item.currency)}
                      {item.overtimeHours > 0 && <span className="person__sub">{item.overtimeHours} h</span>}
                    </td>
                    <td className="num" title={item.adjustmentNote || undefined}>
                      {item.adjustment !== 0 ? formatCurrency(item.adjustment, item.currency) : '—'}
                      {item.adjustmentNote && <span className="person__sub">{item.adjustmentNote}</span>}
                    </td>
                    <td className="num">{formatCurrency(item.totalAmount, item.currency)}</td>
                    <td className="num">
                      <strong>{formatCurrency(item.totalPkr, 'PKR')}</strong>
                    </td>
                    {isDraft && (
                      <td>
                        <div className="row-actions">
                          <button type="button" className="icon-btn" onClick={() => setItemTarget(item)} aria-label={`Adjust pay of ${item.employeeName}`} title="Adjust pay">
                            <Icon name="edit" size={17} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5}>
                    <strong>Total</strong>
                  </td>
                  <td className="num">
                    <strong>{formatCurrency(run.totalPkr, 'PKR')}</strong>
                  </td>
                  {isDraft && <td />}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {itemTarget && (
        <PayrollItemModal
          payrollId={run.payrollId}
          item={itemTarget}
          onClose={() => setItemTarget(null)}
          onSaved={(message) => {
            setItemTarget(null)
            setNotice(message)
            reload()
          }}
        />
      )}

      {active && (
        <ConfirmDialog title={active.title} message={active.message} confirmLabel={active.label} danger={active.danger} onConfirm={handleConfirm} onCancel={() => setConfirm(null)} />
      )}
    </div>
  )
}

export default PayrollDetailsPage
