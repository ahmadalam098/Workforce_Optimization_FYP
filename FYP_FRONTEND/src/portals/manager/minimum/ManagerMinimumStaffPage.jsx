import { useState } from 'react'
import Alert from '../../../components/ui/Alert.jsx'
import Badge from '../../../components/ui/Badge.jsx'
import Button from '../../../components/ui/Button.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import Modal from '../../../components/ui/Modal.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import { useFlashNotice } from '../../../hooks/useFlashNotice.js'
import { managerMinimumStaffingApi } from '../../../services/manager/managerService.js'
import { formatDateTime } from '../../../utils/format.js'
import Notice from '../../admin/shared/Notice.jsx'
import PageHeader from '../../admin/shared/PageHeader.jsx'
import { EmptyState, ErrorState } from '../../admin/shared/StateBox.jsx'
import MinimumStaffPicker from './MinimumStaffPicker.jsx'

/**
 * Organization Manager: the minimum employees of each active contract. The AI allocation will appoint them by itself later; for now the
 * manager chooses them here from the free employees. Extra employees (on top of the minimum) come through Staff Requests.
 */
function ManagerMinimumStaffPage() {
  const [notice, setNotice] = useFlashNotice()
  const [appointing, setAppointing] = useState(null)
  const [releasing, setReleasing] = useState(null)
  const [problem, setProblem] = useState('')
  const { data, error, loading, reload } = useFetch((signal) => managerMinimumStaffingApi.list(signal), 'manager-minimum-staffing')
  const contracts = data ?? []

  async function release(person) {
    setReleasing(person.allocationId)
    setProblem('')
    try {
      const result = await managerMinimumStaffingApi.release(person.allocationId)
      setNotice(result?.message || 'Released.')
      reload()
    } catch (err) {
      setProblem(err.message)
    } finally {
      setReleasing(null)
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Minimum Staff"
        description="Every contract has a minimum number of employees. Until the AI allocation does it automatically, you choose them here from the free employees. For a daily contract, appoint them again each day."
      />
      <Notice message={notice} onClose={() => setNotice('')} />
      {problem && <Alert type="error" onClose={() => setProblem('')}>{problem}</Alert>}

      {error && !data ? (
        <section className="card">
          <ErrorState error={error} onRetry={reload} />
        </section>
      ) : !data && loading ? (
        <Spinner label="Loading the contracts..." />
      ) : contracts.length === 0 ? (
        <section className="card">
          <EmptyState icon="file" title="No active contracts" text="Your organizations have no active contract yet." />
        </section>
      ) : (
        contracts.map((contract) => (
          <section className="card" key={contract.contractId}>
            <div className="card__header">
              <h3 className="card__title">
                {contract.orgName} · {contract.contractNumber}
              </h3>
              <Badge tone={contract.missing === 0 ? 'success' : 'danger'}>{contract.missing === 0 ? 'Minimum complete' : `${contract.missing} missing`}</Badge>
            </div>
            <div className="card__body form-stack">
              <p>
                Minimum <strong>{contract.min}</strong>, maximum <strong>{contract.max ?? 'any'}</strong>
                {contract.isDaily && contract.window ? <> · daily from <strong>{contract.window}</strong></> : null} · appointed: <strong>{contract.appointed}</strong>
                {contract.extraNow > 0 && <> · extra from staff requests: <strong>{contract.extraNow}</strong></>}
              </p>
              {contract.hint && <Alert type="info">{contract.hint}</Alert>}
              {contract.staff.length > 0 ? (
                <ul className="plain-list">
                  {contract.staff.map((person) => (
                    <li key={person.allocationId} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <strong>{person.name}</strong>
                      <span className="cell-muted">
                        since {formatDateTime(person.since)}
                        {person.until ? ` · until ${formatDateTime(person.until)}` : ''}
                      </span>
                      <Button variant="secondary" onClick={() => release(person)} loading={releasing === person.allocationId}>
                        Release
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="cell-muted">Nobody is appointed as the minimum staff yet.</p>
              )}
              <div>
                <Button onClick={() => setAppointing(contract)} disabled={!contract.canStaff}>
                  <Icon name="users" size={17} /> Appoint minimum employees
                </Button>
              </div>
            </div>
          </section>
        ))
      )}

      {appointing && (
        <Modal
          title={`Appoint minimum employees - ${appointing.orgName}`}
          subtitle={`Contract ${appointing.contractNumber}`}
          size="lg"
          onClose={() => setAppointing(null)}
          footer={
            <Button variant="secondary" onClick={() => setAppointing(null)}>
              Close
            </Button>
          }
        >
          <MinimumStaffPicker
            contract={appointing}
            onDone={(message) => {
              setNotice(message)
              reload()
              setAppointing(null)
            }}
          />
        </Modal>
      )}
    </div>
  )
}

export default ManagerMinimumStaffPage
