import { useState } from 'react'
import { useParams } from 'react-router-dom'
import Alert from '../ui/Alert.jsx'
import Button from '../ui/Button.jsx'
import Spinner from '../ui/Spinner.jsx'
import { useFetch } from '../../hooks/useFetch.js'
import { documentsApi } from '../../services/documents/documentsService.js'
import { ErrorState } from '../../portals/admin/shared/StateBox.jsx'
import DocumentFrame from './DocumentFrame.jsx'
import InvoiceDocument from './InvoiceDocument.jsx'
import PayoutDocument from './PayoutDocument.jsx'
import ReceiptDocument from './ReceiptDocument.jsx'

const KINDS = {
  invoice: { load: documentsApi.invoice, Component: InvoiceDocument, slip: true },
  receipt: { load: documentsApi.receipt, Component: ReceiptDocument, slip: true },
  payout: { load: documentsApi.payout, Component: PayoutDocument, slip: true },
}

/**
 * One document of the page's :id (invoice, receipt or profit share receipt) in a printable sheet. Every portal uses it with its own back link;
 * `emailAction` (admin) is an optional button that emails the document to the organization.
 */
function DocumentViewerPage({ kind, backTo, backLabel, emailAction }) {
  const { id } = useParams()
  const config = KINDS[kind]
  const [layout, setLayout] = useState('a4')
  const [notice, setNotice] = useState('')
  const [sending, setSending] = useState(false)
  const { data, error, loading, reload } = useFetch((signal) => config.load(id, signal), `document-${kind}-${id}`)

  if (!data && loading) return <Spinner label="Preparing the document..." />
  if (!data) {
    return (
      <div className="page">
        <div className="card">
          <ErrorState error={error} onRetry={reload} />
        </div>
      </div>
    )
  }

  async function send() {
    setSending(true)
    setNotice('')
    try {
      const result = await emailAction.run(id, data)
      setNotice(result?.message || 'Done.')
    } catch (problem) {
      setNotice(problem.message)
    } finally {
      setSending(false)
    }
  }

  const { Component } = config
  return (
    <>
      <DocumentFrame
        backTo={typeof backTo === 'function' ? backTo(id, data) : backTo}
        backLabel={backLabel}
        layout={config.slip ? layout : 'a4'}
        onLayout={config.slip ? setLayout : null}
        actions={
          emailAction && (
            <Button variant="secondary" onClick={send} loading={sending}>
              {emailAction.label}
            </Button>
          )
        }
      >
        <Component doc={data} layout={layout} />
      </DocumentFrame>
      {notice && (
        <div className="page" style={{ paddingTop: 0 }}>
          <Alert type="info" onClose={() => setNotice('')}>
            {notice}
          </Alert>
        </div>
      )}
    </>
  )
}

export default DocumentViewerPage
