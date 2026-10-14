import { useState } from 'react'
import TextField from '../../../components/ui/TextField.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import { useDebouncedValue } from '../../../hooks/useDebouncedValue.js'
import { useFetch } from '../../../hooks/useFetch.js'
import { employeesApi } from '../../../services/adminService.js'
import './AssignEmployeesModal.css'

/** Search active employees and pick one. onChange receives the employee row. */
function EmployeePicker({ label = 'Employee', selectedId, onChange, error }) {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const params = { search: debouncedSearch.trim(), active: true, page: 1, pageSize: 6 }
  const { data, loading } = useFetch((signal) => employeesApi.list(params, signal), JSON.stringify(params))
  const items = data?.items ?? []

  return (
    <div className="form-stack">
      <TextField label={label} icon="search" placeholder="Search by name, email or CNIC" value={search} onChange={(event) => setSearch(event.target.value)} error={error} autoComplete="off" />
      {!data && loading ? (
        <Spinner label="Loading employees..." size={22} />
      ) : items.length === 0 ? (
        <p className="cell-muted">No active employees found.</p>
      ) : (
        <ul className="assign-list" aria-label="Employees">
          {items.map((employee) => {
            const selected = selectedId === employee.employeeId
            return (
              <li key={employee.employeeId}>
                <label className={`assign-list__item ${selected ? 'is-checked' : ''}`}>
                  <input type="radio" name="employee-picker" checked={selected} onChange={() => onChange(employee)} />
                  <span className="assign-list__text">
                    <strong>{employee.fullName}</strong>
                    <span className="cell-muted">{employee.organizationName || 'Central pool'}</span>
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default EmployeePicker
