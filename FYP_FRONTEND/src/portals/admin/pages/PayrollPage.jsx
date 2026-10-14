import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import Button from '../../../components/ui/Button.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import Pagination from '../../../components/ui/Pagination.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import { OVERTIME_STATUS_OPTIONS } from '../../../constants/billing.js'
import { useDebouncedValue } from '../../../hooks/useDebouncedValue.js'
import { useFetch } from '../../../hooks/useFetch.js'
import { overtimeApi, payrollApi } from '../../../services/adminService.js'
import { formatCurrency, formatDate, formatMonth } from '../../../utils/format.js'
import Notice from '../components/Notice.jsx'
import PageHeader from '../components/PageHeader.jsx'
import { EmptyState, ErrorState } from '../components/StateBox.jsx'
import WorkflowBadge from '../components/WorkflowBadge.jsx'
import { useFlashNotice } from '../../../hooks/useFlashNotice.js'
import ViewButton from '../components/ViewButton.jsx'

const TABS = [
  { id: 'runs', label: 'Payroll runs' },
  { id: 'overtime', label: 'Overtime' },
]

/** Monthly payroll runs and the overtime that feeds them. */
function PayrollPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [tab, setTab] = useState(location.state?.tab === 'overtime' ? 'overtime' : 'runs')
  const [notice, setNotice] = useFlashNotice()

  return (
    <div className="page">
      <PageHeader
        title="Payroll"
        description="Employees are paid a fixed monthly salary; overtime is added from approved entries."
        actions={
          tab === 'runs' ? (
            <Button onClick={() => navigate('/admin/payroll/new')}>
              <Icon name="plus" size={18} /> Generate payroll
            </Button>
          ) : (
            <Button onClick={() => navigate('/admin/payroll/new-overtime')}>
              <Icon name="plus" size={18} /> Record overtime
            </Button>
          )
        }
      />

      <Notice message={notice} onClose={() => setNotice('')} />

      <div className="tabs" role="tablist" aria-label="Payroll sections">
        {TABS.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={`tabs__tab ${tab === item.id ? 'is-active' : ''}`} onClick={() => setTab(item.id)}>
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'runs' ? <RunsPanel /> : <OvertimePanel onChanged={setNotice} />}
    </div>
  )
}

function RunsPanel() {
  const [page, setPage] = useState(1)
  const params = { page, pageSize: 12 }
  const { data, error, loading, reload } = useFetch((signal) => payrollApi.list(params, signal), JSON.stringify(params))
  const items = data?.items ?? []

  return (
    <section className="card">
      {error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !data && loading ? (
        <Spinner label="Loading payroll..." />
      ) : items.length === 0 ? (
        <EmptyState icon="users" title="No payroll yet" text="Set salaries first, then generate the payroll for a month." />
      ) : (
        <>
          <div className="table-wrap" aria-busy={loading}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Status</th>
                  <th className="num">Employees</th>
                  <th className="num">Total (PKR)</th>
                  <th>Created</th>
                  <th>Paid</th>
                  <th>View</th>
                </tr>
              </thead>
              <tbody>
                {items.map((run) => (
                  <tr key={run.payrollId}>
                    <td>
                      <span className="person__name">{formatMonth(run.periodYear, run.periodMonth)}</span>
                    </td>
                    <td>
                      <WorkflowBadge status={run.status} />
                    </td>
                    <td className="num">{run.employeeCount}</td>
                    <td className="num">{formatCurrency(run.totalPkr, 'PKR')}</td>
                    <td className="cell-muted cell-date">{formatDate(run.createdAt)}</td>
                    <td className="cell-muted cell-date">{run.paidAt ? formatDate(run.paidAt) : '—'}</td>
<td>
  <ViewButton to={`/admin/payroll/${run.payrollId}`} label={`View payroll ${formatMonth(run.periodYear, run.periodMonth)}`} />
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
  )
}

function OvertimePanel({ onChanged }) {
  const [status, setStatus] = useState('Pending')
  const [month, setMonth] = useState('') // yyyy-mm from <input type="month">
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const debouncedSearch = useDebouncedValue(search)
  const [year, monthNumber] = month ? month.split('-') : ['', '']
  const params = { status, year, month: monthNumber, search: debouncedSearch.trim(), page, pageSize: 10 }
  const { data, error, loading, reload } = useFetch((signal) => overtimeApi.list(params, signal), JSON.stringify(params))
  const items = data?.items ?? []

  async function decide(entry, action) {
    try {
      const result = await overtimeApi[action](entry.overtimeId)
      onChanged(result?.message || 'Updated.')
      reload()
    } catch (err) {
      onChanged(err.message)
    }
  }

  return (
    <section className="card">
      <div className="toolbar">
        <TextField
          className="toolbar__search"
          label="Search employee"
          icon="search"
          placeholder="Search by employee name"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setPage(1)
          }}
        />
        <SelectField className="toolbar__filter" label="Status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }} options={OVERTIME_STATUS_OPTIONS} placeholder="All statuses" />
        <TextField className="toolbar__filter" label="Month" type="month" value={month} onChange={(event) => { setMonth(event.target.value); setPage(1) }} />
      </div>

      {error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !data && loading ? (
        <Spinner label="Loading overtime..." />
      ) : items.length === 0 ? (
        <EmptyState icon="clock" title="No overtime entries" text="Record overtime hours worked beyond the normal shift. Approved entries are paid in the payroll." />
      ) : (
        <>
          <div className="table-wrap" aria-busy={loading}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Date</th>
                  <th className="num">Hours</th>
                  <th className="num">Rate</th>
                  <th className="num">Amount</th>
                  <th>Status</th>
                  <th>
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((entry) => (
                  <tr key={entry.overtimeId}>
                    <td>
                      {entry.employeeId ? (
                        <Link className="person__name" to={`/admin/employees/${entry.employeeId}`}>
                          {entry.employeeName}
                        </Link>
                      ) : (
                        '—'
                      )}
                      {entry.organizationName && <span className="person__sub">{entry.organizationName}</span>}
                    </td>
                    <td className="cell-muted cell-date">{entry.workDate ? formatDate(entry.workDate) : '—'}</td>
                    <td className="num">{entry.totalHours}</td>
                    <td className="num">{formatCurrency(entry.hourlyRate, entry.currency)}</td>
                    <td className="num">{formatCurrency(entry.amount, entry.currency)}</td>
                    <td>
                      <WorkflowBadge status={entry.status} />
                    </td>
                    <td>
                      {entry.status === 'Pending' && (
                        <div className="row-actions">
                          <button type="button" className="icon-btn" onClick={() => decide(entry, 'approve')} aria-label={`Approve overtime of ${entry.employeeName}`} title="Approve">
                            <Icon name="checkCircle" size={17} />
                          </button>
                          <button type="button" className="icon-btn icon-btn--danger" onClick={() => decide(entry, 'reject')} aria-label={`Reject overtime of ${entry.employeeName}`} title="Reject">
                            <Icon name="close" size={17} />
                          </button>
                        </div>
                      )}
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
  )
}

export default PayrollPage
