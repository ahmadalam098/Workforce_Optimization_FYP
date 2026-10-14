import { useState } from 'react'
import Modal from '../../../components/ui/Modal.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import Button from '../../../components/ui/Button.jsx'
import Alert from '../../../components/ui/Alert.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import { useDebouncedValue } from '../../../hooks/useDebouncedValue.js'
import { useFetch } from '../../../hooks/useFetch.js'
import { employeesApi, shiftsApi } from '../../../services/adminService.js'
import './AssignEmployeesModal.css'

/** Search active employees and assign several of them to a shift at once. */
function AssignEmployeesModal({ shift, onClose, onDone }) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState([]) // employee ids
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const debouncedSearch = useDebouncedValue(search)
  const params = { search: debouncedSearch.trim(), active: true, page: 1, pageSize: 8 }
  const { data, error, loading } = useFetch((signal) => employeesApi.list(params, signal), JSON.stringify(params))

  const items = data?.items ?? []

  function toggle(id) {
    setSelected((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]))
  }

  async function handleAssign() {
    setSubmitting(true)
    setServerError('')
    try {
      const result = await shiftsApi.assign(shift.shiftId, selected)
      onDone(result?.message || 'Employees assigned.')
    } catch (err) {
      setServerError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={`Assign employees to ${shift.name}`}
      subtitle="Employees move from their current shift to this one; the old assignment is kept in their history."
      size="lg"
      onClose={onClose}
      busy={submitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleAssign} loading={submitting} disabled={selected.length === 0}>
            Assign {selected.length > 0 ? `${selected.length} employee${selected.length === 1 ? '' : 's'}` : 'employees'}
          </Button>
        </>
      }
    >
      <div className="form-stack">
        {serverError && <Alert type="error">{serverError}</Alert>}

        <TextField label="Search employees" icon="search" placeholder="Search by name, email or CNIC" value={search} onChange={(event) => setSearch(event.target.value)} autoComplete="off" />

        {error && !data ? (
          <Alert type="error">{error.message}</Alert>
        ) : !data && loading ? (
          <Spinner label="Loading employees..." />
        ) : items.length === 0 ? (
          <p className="cell-muted">No active employees found.</p>
        ) : (
          <ul className="assign-list" aria-busy={loading}>
            {items.map((employee) => {
              const onThisShift = employee.shiftName === shift.name
              const checked = selected.includes(employee.employeeId)
              return (
                <li key={employee.employeeId}>
                  <label className={`assign-list__item ${checked ? 'is-checked' : ''} ${onThisShift ? 'is-disabled' : ''}`}>
                    <input type="checkbox" checked={checked} disabled={onThisShift} onChange={() => toggle(employee.employeeId)} />
                    <span className="assign-list__text">
                      <strong>{employee.fullName}</strong>
                      <span className="cell-muted">
                        {employee.organizationName || 'Central pool'}
                        {employee.shiftName ? ` · now on ${employee.shiftName}` : ' · no shift'}
                      </span>
                    </span>
                    {onThisShift && <span className="assign-list__tag">Already here</span>}
                  </label>
                </li>
              )
            })}
          </ul>
        )}

        {data && data.total > items.length && <p className="cell-muted">Showing {items.length} of {data.total}. Refine the search to find others.</p>}
      </div>
    </Modal>
  )
}

export default AssignEmployeesModal
