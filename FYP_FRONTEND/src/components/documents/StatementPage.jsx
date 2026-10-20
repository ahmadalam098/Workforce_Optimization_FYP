import { useState } from 'react'
import Alert from '../ui/Alert.jsx'
import Button from '../ui/Button.jsx'
import SelectField from '../ui/SelectField.jsx'
import Spinner from '../ui/Spinner.jsx'
import TextField from '../ui/TextField.jsx'
import { useFetch } from '../../hooks/useFetch.js'
import { documentsApi } from '../../services/documents/documentsService.js'
import { EmptyState, ErrorState } from '../../portals/admin/shared/StateBox.jsx'
import DocumentFrame from './DocumentFrame.jsx'
import StatementDocument from './StatementDocument.jsx'

const pad = (value) => String(value).padStart(2, '0')
const toInput = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const defaultRange = () => {
  const now = new Date()
  return { from: toInput(new Date(now.getFullYear(), now.getMonth() - 3, 1)), to: toInput(now) }
}

/**
 * The statement of account of an organization for any period (invoices, payments, what is owed). The admin and a manager choose the organization
 * (`organizations`: [{ value, label }]); an organization always sees its own. `emailAction` (admin) emails it to the organization.
 */
function StatementPage({ organizations, emailAction, title = 'Statement of account' }) {
  const [orgId, setOrgId] = useState(organizations?.length === 1 ? organizations[0].value : '')
  const [range, setRange] = useState(defaultRange)
  const [notice, setNotice] = useState('')
  const [sending, setSending] = useState(false)
  const needsOrganization = Boolean(organizations)
  const ready = (!needsOrganization || orgId) && range.from && range.to && range.from <= range.to
  const params = { orgId: orgId || undefined, from: range.from, to: range.to }
  const { data, error, loading, reload } = useFetch((signal) => (ready ? documentsApi.statement(params, signal) : Promise.resolve(null)), `statement-${orgId}-${range.from}-${range.to}-${ready}`)

  async function send() {
    setSending(true)
    setNotice('')
    try {
      const result = await emailAction.run({ orgId, from: range.from, to: range.to })
      setNotice(result?.message || 'Done.')
    } catch (problem) {
      setNotice(problem.message)
    } finally {
      setSending(false)
    }
  }

  const filters = (
    <>
      {needsOrganization && <SelectField className="toolbar__filter" label="Organization" value={orgId} onChange={(event) => setOrgId(event.target.value)} options={organizations} placeholder="Choose an organization" />}
      <TextField className="toolbar__filter" label="From" type="date" value={range.from} onChange={(event) => setRange((current) => ({ ...current, from: event.target.value }))} error={range.from > range.to ? 'Start is after the end.' : undefined} />
      <TextField className="toolbar__filter" label="To" type="date" value={range.to} onChange={(event) => setRange((current) => ({ ...current, to: event.target.value }))} />
    </>
  )

  return (
    <DocumentFrame
      layout="a4"
      filters={filters}
      actions={
        emailAction &&
        data && (
          <Button variant="secondary" onClick={send} loading={sending}>
            {emailAction.label}
          </Button>
        )
      }
    >
      {!ready ? (
        <div className="card">
          <EmptyState icon="file" title={title} text={needsOrganization && !orgId ? 'Choose an organization and a period to see its statement.' : 'Choose a valid period.'} />
        </div>
      ) : error && !data ? (
        <div className="card">
          <ErrorState error={error} onRetry={reload} />
        </div>
      ) : !data && loading ? (
        <Spinner label="Preparing the statement..." />
      ) : data ? (
        <>
          {notice && (
            <Alert type="info" onClose={() => setNotice('')}>
              {notice}
            </Alert>
          )}
          <StatementDocument doc={data} />
        </>
      ) : null}
    </DocumentFrame>
  )
}

export default StatementPage
