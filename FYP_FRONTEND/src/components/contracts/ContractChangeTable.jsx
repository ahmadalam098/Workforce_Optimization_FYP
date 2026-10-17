import { TERM_GROUPS } from '../../constants/contracts.js'
import { formatTerm } from '../../utils/contractFormat.js'

const LABELS = Object.fromEntries(TERM_GROUPS.flatMap((group) => group.fields.map((field) => [field.key, field.label])))

/**
 * The terms of a contract that a change asks to alter: what it is now and what is asked for (the current value is known only while
 * the change is waiting). Used by the organization and by the admin. `changes` is [{ key, current, proposed }].
 */
function ContractChangeTable({ changes, showCurrent = true }) {
  if (!changes || changes.length === 0) return <p className="cell-muted">No term is changed.</p>
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Term</th>
            {showCurrent && <th>Now</th>}
            <th>Asked for</th>
          </tr>
        </thead>
        <tbody>
          {changes.map((change) => (
            <tr key={change.key}>
              <td>{LABELS[change.key] ?? change.key}</td>
              {showCurrent && <td className="cell-muted">{change.current === null || change.current === undefined ? '—' : formatTerm(change.key, change.current)}</td>}
              <td>
                <strong>{formatTerm(change.key, change.proposed)}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default ContractChangeTable
