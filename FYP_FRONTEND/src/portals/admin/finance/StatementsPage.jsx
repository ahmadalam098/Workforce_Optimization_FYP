import StatementPage from '../../../components/documents/StatementPage.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import { billingMailApi, organizationsApi } from '../../../services/admin/adminService.js'

/** Admin: the statement of account of any organization for any period - print it, or email it to the organization. */
function StatementsPage() {
  const { data: organizations } = useFetch((signal) => organizationsApi.lookup(signal), 'admin-org-lookup')
  const options = (organizations ?? []).map((org) => ({ value: String(org.organizationId), label: org.name }))
  return <StatementPage organizations={options} emailAction={{ label: 'Email to the organization', run: (params) => billingMailApi.statement(params) }} />
}

export default StatementsPage
