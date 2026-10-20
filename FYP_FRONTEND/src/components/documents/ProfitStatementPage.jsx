import { useState } from 'react'
import Spinner from '../ui/Spinner.jsx'
import TextField from '../ui/TextField.jsx'
import { useFetch } from '../../hooks/useFetch.js'
import { documentsApi } from '../../services/documents/documentsService.js'
import { EmptyState, ErrorState } from '../../portals/admin/shared/StateBox.jsx'
import DocumentFrame from './DocumentFrame.jsx'
import ProfitDocument from './ProfitDocument.jsx'

const pad = (value) => String(value).padStart(2, '0')
const toInput = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

/** The profit statement of a period for the business owners: money received, salaries paid, profit and each owner's share, printable. */
function ProfitStatementPage({ backTo, backLabel }) {
  const [range, setRange] = useState(() => {
    const now = new Date()
    return { from: toInput(new Date(now.getFullYear(), now.getMonth() - 5, 1)), to: toInput(now) }
  })
  const ready = range.from && range.to && range.from <= range.to
  const { data, error, loading, reload } = useFetch((signal) => (ready ? documentsApi.profit(range, signal) : Promise.resolve(null)), `profit-${range.from}-${range.to}-${ready}`)

  const filters = (
    <>
      <TextField className="toolbar__filter" label="From" type="date" value={range.from} onChange={(event) => setRange((current) => ({ ...current, from: event.target.value }))} error={range.from > range.to ? 'Start is after the end.' : undefined} />
      <TextField className="toolbar__filter" label="To" type="date" value={range.to} onChange={(event) => setRange((current) => ({ ...current, to: event.target.value }))} />
    </>
  )

  return (
    <DocumentFrame backTo={backTo} backLabel={backLabel} layout="a4" filters={filters}>
      {!ready ? (
        <div className="card">
          <EmptyState icon="chart" title="Profit statement" text="Choose a valid period." />
        </div>
      ) : error && !data ? (
        <div className="card">
          <ErrorState error={error} onRetry={reload} />
        </div>
      ) : !data && loading ? (
        <Spinner label="Preparing the statement..." />
      ) : data ? (
        <ProfitDocument doc={data} />
      ) : null}
    </DocumentFrame>
  )
}

export default ProfitStatementPage
