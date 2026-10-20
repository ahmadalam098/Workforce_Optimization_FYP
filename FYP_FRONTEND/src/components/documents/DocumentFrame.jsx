import { Link } from 'react-router-dom'
import Button from '../ui/Button.jsx'
import Icon from '../ui/Icon.jsx'
import './documents.css'

const LAYOUTS = [
  { id: 'a4', label: 'A4 page' },
  { id: 'slip', label: 'Slip (80 mm)' },
]

/**
 * Around every document: the way back, the A4 / slip switch (for documents that have a slip), Print, and the page's own actions. Only the sheet
 * is printed; the paper size follows the switch. "Save as PDF" is the printer choice of the print window.
 */
function DocumentFrame({ backTo, backLabel, layout, onLayout, actions, filters, children }) {
  const slip = layout === 'slip'
  return (
    <div className="page">
      <style>{`@media print { @page { size: ${slip ? '80mm auto' : 'A4'}; margin: ${slip ? '3mm' : '12mm'}; } }`}</style>
      <div className="doc-toolbar">
        {backTo && (
          <Link className="back-link" to={backTo}>
            <Icon name="arrowLeft" size={16} /> {backLabel}
          </Link>
        )}
        <span className="doc-toolbar__spacer" />
        {onLayout && (
          <div className="doc-switch" role="group" aria-label="Paper">
            {LAYOUTS.map((item) => (
              <button key={item.id} type="button" className={layout === item.id ? 'is-active' : ''} onClick={() => onLayout(item.id)} aria-pressed={layout === item.id}>
                {item.label}
              </button>
            ))}
          </div>
        )}
        {actions}
        <Button onClick={() => window.print()}>
          <Icon name="file" size={17} /> Print / Save as PDF
        </Button>
      </div>
      {filters && (
        <section className="card" style={{ marginTop: '0.75rem' }}>
          <div className="toolbar">{filters}</div>
        </section>
      )}
      <div className="doc-stage">
        <div className="doc-print">{children}</div>
      </div>
    </div>
  )
}

export default DocumentFrame
