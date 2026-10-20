import { useState } from 'react'
import Button from '../../../components/ui/Button.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import BankDetailsForm from '../../../components/payments/BankDetailsForm.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import { employeeBankAdminApi } from '../../../services/admin/adminService.js'
import { formatDateTime } from '../../../utils/format.js'
import { ErrorState } from '../shared/StateBox.jsx'

/** Where this employee's salary is paid. The employee fills it in; the admin can read and correct it. The payroll sheet uses it. */
function EmployeeBankCard({ employeeId }) {
  const [editing, setEditing] = useState(false)
  const [notice, setNotice] = useState('')
  const { data: bank, error, loading, reload } = useFetch((signal) => employeeBankAdminApi.get(employeeId, signal), `admin-employee-bank-${employeeId}`)

  return (
    <section className="card">
      <div className="card__header">
        <h3 className="card__title">Bank details</h3>
        {bank && !editing && (
          <Button variant="secondary" onClick={() => setEditing(true)}>
            {bank.hasBank ? 'Edit' : 'Add'}
          </Button>
        )}
      </div>
      <div className="card__body">
        {error && !bank ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !bank && loading ? (
          <Spinner label="Loading..." />
        ) : editing ? (
          <BankDetailsForm
            bank={bank}
            onSave={(body) => employeeBankAdminApi.save(employeeId, body)}
            onSaved={(message) => {
              setEditing(false)
              setNotice(message)
              reload()
            }}
          />
        ) : bank.hasBank ? (
          <dl className="info-list">
            <div className="info-item">
              <dt>Bank</dt>
              <dd>{bank.bankName}</dd>
            </div>
            <div className="info-item">
              <dt>Account title</dt>
              <dd>{bank.accountTitle}</dd>
            </div>
            <div className="info-item">
              <dt>Account / IBAN</dt>
              <dd>{bank.accountNumber}</dd>
            </div>
            <div className="info-item">
              <dt>Updated</dt>
              <dd>{formatDateTime(bank.updatedAt)}</dd>
            </div>
          </dl>
        ) : (
          <p className="cell-muted">No bank details yet. The employee can add them in their Settings, or you can add them here.</p>
        )}
        {notice && <p className="cell-muted">{notice}</p>}
      </div>
    </section>
  )
}

export default EmployeeBankCard
