import { useState } from 'react'
import Alert from '../../../components/ui/Alert.jsx'
import ReceivablesReport from '../../../components/payments/ReceivablesReport.jsx'
import { managerBillingApi, managerReceivablesApi } from '../../../services/manager/managerService.js'
import PageHeader from '../../admin/shared/PageHeader.jsx'

/** Organization Manager: what your organizations still owe, by how late it is, with a button to remind an organization about a late invoice. */
function ManagerReceivablesPage() {
  const [notice, setNotice] = useState('')

  async function remind(row) {
    try {
      const result = await managerBillingApi.reminder(row.invoiceId)
      setNotice(result?.message || 'Reminder sent.')
    } catch (problem) {
      setNotice(problem.message)
    }
  }

  return (
    <div className="page">
      <PageHeader title="Late Payments" description="What your organizations still owe, by how late it is. Remind an organization about a late invoice with one click." />
      {notice && (
        <Alert type="info" onClose={() => setNotice('')}>
          {notice}
        </Alert>
      )}
      <ReceivablesReport load={(signal) => managerReceivablesApi.get({}, signal)} invoiceLink={(row) => `/manager/invoices/${row.invoiceId}`} remind={remind} fileName="my-receivables" />
    </div>
  )
}

export default ManagerReceivablesPage
