import { useState } from 'react'
import { Link } from 'react-router-dom'
import Alert from '../../../components/ui/Alert.jsx'
import Avatar from '../../../components/ui/Avatar.jsx'
import Badge from '../../../components/ui/Badge.jsx'
import Button from '../../../components/ui/Button.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import { useDebouncedValue } from '../../../hooks/useDebouncedValue.js'
import { useFetch } from '../../../hooks/useFetch.js'
import { managerOffersApi, managerRequestsApi } from '../../../services/manager/managerService.js'
import { EmptyState, ErrorState } from '../../admin/shared/StateBox.jsx'
import { AvailabilityBadge } from '../../admin/shared/StatusBadge.jsx'

/** The free employees in the pool, best fit first, to tick and allocate to this request by hand. */
function RequestStaffPicker({ request, onStaffed }) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [problem, setProblem] = useState('')
  const [results, setResults] = useState(null)

  const debouncedSearch = useDebouncedValue(search)
  const { data: candidates, error, loading, reload } = useFetch((signal) => managerRequestsApi.candidates(request.requestId, debouncedSearch.trim(), signal), `candidates-${request.requestId}-${debouncedSearch.trim()}`)

  async function sendOffers() {
    setSubmitting(true)
    setProblem('')
    setResults(null)
    try {
      const result = await managerOffersApi.forRequest(request.requestId, selected)
      setSelected([])
      setResults(result)
      onStaffed(result.message)
      reload()
    } catch (error_) {
      setProblem(error_.message)
    } finally {
      setSubmitting(false)
    }
  }

  const toggle = (employeeId) =>
    setSelected((current) => (current.includes(employeeId) ? current.filter((id) => id !== employeeId) : current.length >= request.stillNeeded ? current : [...current, employeeId]))

  async function assign() {
    setSubmitting(true)
    setProblem('')
    setResults(null)
    try {
      const result = await managerRequestsApi.staff(request.requestId, selected)
      setSelected([])
      setResults(result)
      onStaffed(result.message)
      reload()
    } catch (error_) {
      setProblem(error_.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="form-stack">
        <p className="cell-muted">
          {request.stillNeeded} more employee{request.stillNeeded === 1 ? ' is' : 's are'} needed. Tick up to {request.stillNeeded} free employee{request.stillNeeded === 1 ? '' : 's'}; the best fit (skill{request.skillName ? ` "${request.skillName}"` : ''},
          availability, rating) is listed first. The same contract rules as the admin apply.{request.willApprove && ' Allocating also approves this request.'}
        </p>
        {problem && <Alert type="error">{problem}</Alert>}
        {results && results.results.some((row) => !row.ok) && (
          <Alert type="warning">
            <ul>
              {results.results
                .filter((row) => !row.ok)
                .map((row) => (
                  <li key={row.employeeId}>{row.message}</li>
                ))}
            </ul>
          </Alert>
        )}
        <TextField label="Search the pool" icon="search" placeholder="Search by name" value={search} onChange={(event) => setSearch(event.target.value)} />
        {error && !candidates ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !candidates && loading ? (
          <Spinner label="Loading the pool..." />
        ) : candidates.length === 0 ? (
          <EmptyState icon="users" title="No free employees" text="Everyone is allocated or inactive right now." />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th />
                  <th>Employee</th>
                  <th>Skills</th>
                  <th>Status</th>
                  <th>Home organization</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((employee) => {
                  const checked = selected.includes(employee.employeeId)
                  return (
                    <tr key={employee.employeeId}>
                      <td>
                        <input type="checkbox" checked={checked} disabled={!checked && selected.length >= request.stillNeeded} onChange={() => toggle(employee.employeeId)} aria-label={`Choose ${employee.fullName}`} />
                      </td>
                      <td>
                        <div className="person">
                          <Avatar userId={employee.userId} name={employee.fullName} hasPicture={employee.hasPicture} />
                          <span>
                            <Link className="person__name" to={`/manager/employees/${employee.employeeId}`}>
                              {employee.fullName}
                            </Link>
                            <span className="person__sub">{employee.rating != null ? `★ ${Number(employee.rating).toFixed(1)}` : 'No rating'}</span>
                          </span>
                        </div>
                      </td>
                      <td>
                        {employee.matchesSkill && <Badge tone="success">Has the skill</Badge>}
                        {employee.skills.length > 0 ? <span className="person__sub">{employee.skills.join(', ')}</span> : !employee.matchesSkill && <span className="cell-muted">—</span>}
                      </td>
                      <td>
                        <AvailabilityBadge status={employee.availabilityStatus} />
                      </td>
                      <td>
                        {employee.homeOrgName || <span className="cell-muted">Central pool</span>}
                        {employee.isBorrowed && <span className="person__sub">Borrowed</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <div>
          <div className="row-actions">
            <Button onClick={sendOffers} loading={submitting} disabled={selected.length === 0 || request.willApprove} title={request.willApprove ? 'Approve the request first' : undefined}>
              Send to {selected.length > 0 ? `${selected.length} selected` : 'selected'} employee{selected.length === 1 ? '' : 's'}
            </Button>
            <Button variant="secondary" onClick={assign} loading={submitting} disabled={selected.length === 0}>
              Assign directly
            </Button>
          </div>
          <p className="cell-muted">
            <strong>Send</strong> asks the employee, who accepts or declines in their portal; only then are they allocated. <strong>Assign directly</strong> skips the employee&apos;s answer.
          </p>
        </div>
    </div>
  )
}

export default RequestStaffPicker
