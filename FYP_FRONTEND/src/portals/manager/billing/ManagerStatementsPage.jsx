import StatementPage from '../../../components/documents/StatementPage.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import { managerApi } from '../../../services/manager/managerService.js'

/** Organization Manager: the statement of account of one of your organizations for any period, to print. */
function ManagerStatementsPage() {
  const { data: overview } = useFetch((signal) => managerApi.overview(signal), 'manager-overview')
  const options = (overview?.organizations ?? []).map((org) => ({ value: String(org.organizationId), label: org.name }))
  return <StatementPage organizations={options} />
}

export default ManagerStatementsPage
