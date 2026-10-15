import { Link } from 'react-router-dom'
import Spinner from '../../../components/ui/Spinner.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import { systemApi } from '../../../services/admin/adminService.js'
import { ErrorState } from '../shared/StateBox.jsx'

// Where each role is managed. Roles that have no page yet are listed without a link.
const MANAGE_LINKS = {
  Admin: { to: '/admin/team?tab=admins', label: 'Manage admins' },
  'Business Owner': { to: '/admin/team?tab=owners', label: 'Manage business owners' },
  'Organization Manager': { to: '/admin/team?tab=managers', label: 'Manage managers' },
  Employee: { to: '/admin/employees', label: 'Manage employees' },
}

/** The roles in the system, how many accounts each has, and where to activate or deactivate those accounts. */
function RolesTab() {
  const { data, error, loading, reload } = useFetch((signal) => systemApi.roles(signal), 'roles')

  if (error && !data) {
    return (
      <div className="card">
        <ErrorState error={error} onRetry={reload} />
      </div>
    )
  }
  if (!data && loading) return <Spinner label="Loading roles..." />

  return (
    <section className="card">
      <div className="card__header">
        <h3 className="card__title">Roles and accounts</h3>
      </div>
      <div className="card__body">
        <p className="setting-row__description">
          A person's role decides which portal they can open. Open a role below to see its accounts; there you can add people, edit them, and activate or deactivate their accounts.
        </p>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Role</th>
                <th>What it is for</th>
                <th>Accounts</th>
                <th>Active</th>
                <th>Inactive</th>
                <th aria-label="Manage" />
              </tr>
            </thead>
            <tbody>
              {data.map((role) => {
                const link = MANAGE_LINKS[role.name]
                return (
                  <tr key={role.roleId}>
                    <td>
                      <strong>{role.name}</strong>
                    </td>
                    <td>{role.description || <span className="cell-muted">—</span>}</td>
                    <td>{role.totalUsers}</td>
                    <td>{role.activeUsers}</td>
                    <td>{role.totalUsers - role.activeUsers}</td>
                    <td>{link ? <Link to={link.to}>{link.label}</Link> : <span className="cell-muted">Portal coming soon</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

export default RolesTab
