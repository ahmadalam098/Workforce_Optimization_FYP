import Alert from '../../../components/ui/Alert.jsx'
import Badge from '../../../components/ui/Badge.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import { organizationApi } from '../../../services/organization/organizationService.js'
import { formatDateTime } from '../../../utils/format.js'
import { greeting } from '../../admin/dashboard/dashboardUtils.js'
import { EmptyState, ErrorState } from '../../admin/shared/StateBox.jsx'
import '../../admin/dashboard/AdminDashboardPage.css'

const STATUS_TONES = { Active: 'success', Pending: 'warning' }

function InfoItem({ label, children }) {
  return (
    <div className="info-item">
      <dt>{label}</dt>
      <dd>{children || <span className="cell-muted">—</span>}</dd>
    </div>
  )
}

/**
 * First page of the Organization portal. A starting page for now: it shows that the sign-in worked, who is signed in, and whether the admin
 * has approved the organization yet. The real dashboard is added when its requirements are known. Same layout, colours and fonts as the other portals.
 */
function OrganizationDashboardPage() {
  const { data, error, loading, reload } = useFetch((signal) => organizationApi.overview(signal), 'organization-overview')

  if (!data && loading) return <Spinner label="Loading dashboard..." />
  if (!data) {
    return (
      <div className="card">
        <ErrorState error={error} onRetry={reload} />
      </div>
    )
  }

  const pending = data.status === 'Pending'

  return (
    <div className="dashboard">
      <section className="dashboard-hero">
        <div className="dashboard-hero__text">
          <p className="dashboard-hero__eyebrow">{greeting()}</p>
          <h2 className="dashboard-hero__title">Welcome, {data.name}</h2>
          <p className="dashboard-hero__summary">
            You are signed in successfully as an <strong>Organization</strong>. Your organization dashboard is being prepared and will appear here.
          </p>
        </div>
      </section>

      {pending && (
        <Alert type="info">
          Your registration is <strong>waiting for the admin&apos;s approval</strong>. You will receive an email when it has been reviewed. Until then you can sign in, but the
          organization is not active yet.
        </Alert>
      )}

      <div className="dashboard-columns">
        <section className="card">
          <div className="card__header">
            <h3 className="card__title">Your organization</h3>
          </div>
          <dl className="card__body info-list">
            <InfoItem label="Name">{data.name}</InfoItem>
            <InfoItem label="Email">{data.email}</InfoItem>
            <InfoItem label="Phone">{data.phone}</InfoItem>
            <InfoItem label="Country">{data.country}</InfoItem>
            <InfoItem label="Address">{data.address}</InfoItem>
            <InfoItem label="Status">
              <Badge tone={STATUS_TONES[data.status] || 'neutral'}>{data.status}</Badge>
            </InfoItem>
            <InfoItem label="Registered on">{data.registeredAt ? formatDateTime(data.registeredAt) : null}</InfoItem>
            {data.approvedAt && <InfoItem label="Approved on">{formatDateTime(data.approvedAt)}</InfoItem>}
          </dl>
        </section>

        <section className="card">
          <div className="card__header">
            <h3 className="card__title">Your workforce</h3>
          </div>
          <div className="card__body">
            <EmptyState icon="users" title="Coming soon" text="Your staff requests, employees, invoices and queries will be shown here." />
          </div>
        </section>
      </div>
    </div>
  )
}

export default OrganizationDashboardPage
