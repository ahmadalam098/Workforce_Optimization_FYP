import { useState } from 'react'
import Alert from '../../../components/ui/Alert.jsx'
import ReceivablesReport from '../../../components/payments/ReceivablesReport.jsx'
import { billingMailApi, reportsApi } from '../../../services/admin/adminService.js'

/** The receivables report for the admin: who owes what, by how late, with a button to send a payment reminder for a late invoice. */
function AdminReceivables() {
  const [notice, setNotice] = useState('')

  async function remind(row) {
    try {
      const result = await billingMailApi.reminder(row.invoiceId)
      setNotice(result?.message || 'Reminder sent.')
    } catch (problem) {
      setNotice(problem.message)
    }
  }

  return (
    <>
      {notice && (
        <Alert type="info" onClose={() => setNotice('')}>
          {notice}
        </Alert>
      )}
      <ReceivablesReport load={(signal) => reportsApi.receivables({}, signal)} invoiceLink={(row) => `/admin/invoices/${row.invoiceId}`} remind={remind} fileName="receivables" />
    </>
  )
}

export default AdminReceivables
