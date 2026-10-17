import { useState } from 'react'
import { Link } from 'react-router-dom'
import Alert from '../../../components/ui/Alert.jsx'
import Avatar from '../../../components/ui/Avatar.jsx'
import Button from '../../../components/ui/Button.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import { useDebouncedValue } from '../../../hooks/useDebouncedValue.js'
import { useFetch } from '../../../hooks/useFetch.js'
import { managerMinimumStaffingApi, managerOffersApi } from '../../../services/manager/managerService.js'
import { EmptyState, ErrorState } from '../../admin/shared/StateBox.jsx'
import { AvailabilityBadge } from '../../admin/shared/StatusBadge.jsx'

/** The free employees, to tick and appoint as the minimum staff of a contract. */
function MinimumStaffPicker({ contract, onDone }) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [problem, setProblem] = useState('')
  const [results, setResults] = useState(null)

  const debouncedSearch = useDebouncedValue(search)
  const { data: candidates, error, loading, reload } = useFetch(
    (signal) => managerMinimumStaffingApi.candidates(contract.contractId, debouncedSearch.trim(), signal),
    `minimum-candidates-${contract.contractId}-${debouncedSearch.trim()}`,
  )

  async function sendOffers() {
    setSubmitting(true)
    setProblem('')
    setResults(null)
    try {
      const result = await managerOffersApi.forMinimum(contract.contractId, selected)
      setSelected([])
      setResults(result)
      onDone(result.message)
      reload()
    } catch (err) {
      setProblem(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const toggle = (employeeId) =>
    setSelected((current) => (current.includes(employeeId) ? current.filter((id) => id !== employeeId) : current.length >= contract.missing ? current : [...current, employeeId]))

  async function appoint() {
    setSubmitting(true)
    setProblem('')
    setResults(null)
    try {
      const result = await managerMinimumStaffingApi.staff(contract.contractId, selected)
      setSelected([])
      setResults(result)
      onDone(result.message)
      reload()
    } catch (err) {
      setProblem(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="form-stack">
      <p className="cell-muted">
        {contract.missing} more employee{contract.missing === 1 ? ' is' : 's are'} needed for the minimum. Tick up to {contract.missing}.
        {contract.isDaily ? ' They are appointed for today\'s daily window and end with it.' : ' They stay until you release them.'}
        {contract.borrowingAllowed ? ' The contract allows borrowed employees.' : ' Only the organization\'s own employees are listed (borrowing is not allowed).'}
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
                      <input type="checkbox" checked={checked} disabled={!checked && selected.length >= contract.missing} onChange={() => toggle(employee.employeeId)} aria-label={`Choose ${employee.fullName}`} />
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
                    <td>{employee.skills.length > 0 ? <span className="person__sub">{employee.skills.join(', ')}</span> : <span className="cell-muted">—</span>}</td>
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
          <Button onClick={sendOffers} loading={submitting} disabled={selected.length === 0}>
            Send to {selected.length > 0 ? `${selected.length} selected` : 'selected'} employee{selected.length === 1 ? '' : 's'}
          </Button>
          <Button variant="secondary" onClick={appoint} loading={submitting} disabled={selected.length === 0}>
            Appoint directly
          </Button>
        </div>
        <p className="cell-muted">
          <strong>Send</strong> asks the employee, who accepts or declines in their portal; only then are they on the team. <strong>Appoint directly</strong> skips the employee&apos;s answer.
        </p>
      </div>
    </div>
  )
}

export default MinimumStaffPicker
