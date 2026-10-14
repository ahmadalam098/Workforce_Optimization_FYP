import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Icon from '../../../components/ui/Icon.jsx'
import { PageModeContext } from '../../../components/ui/pageMode.js'
import Spinner from '../../../components/ui/Spinner.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import { organizationsApi, skillsApi } from '../../../services/adminService.js'
import ContractFormModal from '../components/ContractFormModal.jsx'
import EmployeeFormModal from '../components/EmployeeFormModal.jsx'
import InvoiceCreateModal from '../components/InvoiceCreateModal.jsx'
import OrganizationFormModal from '../components/OrganizationFormModal.jsx'
import { ExchangeRateModal, PaymentRuleModal } from '../components/PaymentRuleModals.jsx'
import { NewPayrollModal, OvertimeFormModal } from '../components/PayrollModals.jsx'
import RequestFormModal from '../components/RequestFormModal.jsx'
import RuleFormModal from '../components/RuleFormModal.jsx'
import ShiftFormModal from '../components/ShiftFormModal.jsx'
import SkillFormModal from '../components/SkillFormModal.jsx'
import { ErrorState } from '../components/StateBox.jsx'
import TicketCreateModal from '../components/TicketCreateModal.jsx'
import UserFormModal from '../components/UserFormModal.jsx'

// Team tabs on the Team page, and the role each one adds.
const TEAM_KINDS = {
  admins: 'Admin',
  owners: 'Business Owner',
  managers: 'Organization Manager',
}

/**
 * Every "add" screen opens on its own page. The form is the same one that used to be a pop-up (it is drawn as a page
 * section here), and after saving - or pressing Cancel - the person goes back to the list they came from.
 * `children(close, saved)` draws the form; `saved(message, state)` goes back and shows the message there.
 */
function Shell({ backTo, backLabel, loading, error, children }) {
  const navigate = useNavigate()
  const close = () => navigate(backTo)
  const saved = (message, state = {}) => navigate(backTo, { state: { message, ...state } })

  return (
    <div className="page">
      <Link className="back-link" to={backTo}>
        <Icon name="arrowLeft" size={16} /> Back to {backLabel}
      </Link>
      {error ? (
        <div className="card">
          <ErrorState error={error} />
        </div>
      ) : loading ? (
        <Spinner label="Loading..." />
      ) : (
        <PageModeContext.Provider value>{children(close, saved)}</PageModeContext.Provider>
      )}
    </div>
  )
}

function useOrganizations() {
  return useFetch((signal) => organizationsApi.lookup(signal), 'organizations')
}

function EmployeeFlow() {
  const { data, error } = useOrganizations()
  return (
    <Shell backTo="/admin/employees" backLabel="Employees" loading={!data} error={error}>
      {(close, saved) => <EmployeeFormModal organizations={data} onClose={close} onSaved={(message) => saved(message)} />}
    </Shell>
  )
}

function OrganizationFlow() {
  return (
    <Shell backTo="/admin/organizations" backLabel="Organizations">
      {(close, saved) => <OrganizationFormModal onClose={close} onSaved={(message) => saved(message)} />}
    </Shell>
  )
}

function ContractFlow() {
  const [params] = useSearchParams()
  const organizationId = params.get('organizationId')
  const { data, error } = useOrganizations()
  const approved = (data ?? []).filter((org) => org.status === 'Active' || org.status === 'Approved')
  // Coming from an organization's page goes back to that organization.
  const backTo = organizationId ? `/admin/organizations/${organizationId}` : '/admin/contracts'
  return (
    <Shell backTo={backTo} backLabel={organizationId ? 'organization' : 'Contracts'} loading={!data} error={error}>
      {(close, saved) => (
        <ContractFormModal organizations={approved} defaultOrganizationId={organizationId ? Number(organizationId) : undefined} onClose={close} onSaved={(message) => saved(message)} />
      )}
    </Shell>
  )
}

function TeamFlow() {
  const [params] = useSearchParams()
  const tab = TEAM_KINDS[params.get('tab')] ? params.get('tab') : 'admins'
  const { data, error } = useOrganizations()
  return (
    <Shell backTo={`/admin/team?tab=${tab}`} backLabel="Team" loading={!data} error={error}>
      {(close, saved) => <UserFormModal kind={TEAM_KINDS[tab]} organizations={data} onClose={close} onSaved={(message) => saved(message)} />}
    </Shell>
  )
}

function SkillFlow() {
  const { data, error } = useFetch((signal) => skillsApi.categories(signal), 'skill-categories')
  return (
    <Shell backTo="/admin/skills" backLabel="Skills" loading={!data} error={error}>
      {(close, saved) => <SkillFormModal categories={data} onClose={close} onSaved={(message) => saved(message)} />}
    </Shell>
  )
}

function ShiftFlow() {
  return (
    <Shell backTo="/admin/shifts" backLabel="Shifts">
      {(close, saved) => <ShiftFormModal onClose={close} onSaved={(message) => saved(message)} />}
    </Shell>
  )
}

function RequestFlow() {
  const { data: organizations, error } = useOrganizations()
  const { data: skills, error: skillsError } = useFetch((signal) => skillsApi.lookup(signal), 'skills-lookup')
  return (
    <Shell backTo="/admin/requests" backLabel="Staff Requests" loading={!organizations || !skills} error={error || skillsError}>
      {(close, saved) => <RequestFormModal organizations={organizations} skills={skills} onClose={close} onCreated={(result) => saved(result.message || 'Staff request logged.')} />}
    </Shell>
  )
}

function TicketFlow() {
  const { data, error } = useOrganizations()
  return (
    <Shell backTo="/admin/tickets" backLabel="Queries" loading={!data} error={error}>
      {(close, saved) => <TicketCreateModal organizations={data} onClose={close} onCreated={(result) => saved(result.message || 'Query added.')} />}
    </Shell>
  )
}

function PaymentRuleFlow() {
  return (
    <Shell backTo="/admin/payment-rules" backLabel="Payment Rules">
      {(close, saved) => <PaymentRuleModal onClose={close} onSaved={(message) => saved(message)} />}
    </Shell>
  )
}

function ExchangeRateFlow() {
  return (
    <Shell backTo="/admin/payment-rules?tab=rates" backLabel="Payment Rules">
      {(close, saved) => <ExchangeRateModal onClose={close} onSaved={(message) => saved(message)} />}
    </Shell>
  )
}

function PayrollFlow() {
  return (
    <Shell backTo="/admin/payroll" backLabel="Payroll">
      {(close, saved) => <NewPayrollModal onClose={close} onCreated={(result) => saved(result.message || 'Payroll generated.')} />}
    </Shell>
  )
}

function OvertimeFlow() {
  return (
    <Shell backTo="/admin/payroll" backLabel="Payroll">
      {(close, saved) => <OvertimeFormModal onClose={close} onSaved={(message) => saved(message, { tab: 'overtime' })} />}
    </Shell>
  )
}

function InvoiceFlow() {
  const { data, error } = useOrganizations()
  return (
    <Shell backTo="/admin/invoices" backLabel="Invoices" loading={!data} error={error}>
      {(close, saved) => <InvoiceCreateModal organizations={data} onClose={close} onCreated={(result) => saved(result.message || 'Draft invoice created.')} />}
    </Shell>
  )
}

function ContractRuleFlow() {
  const { contractId } = useParams()
  return (
    <Shell backTo={`/admin/contracts/${contractId}`} backLabel="contract">
      {(close, saved) => <RuleFormModal contractId={Number(contractId)} onClose={close} onSaved={(message) => saved(message, { tab: 'rules' })} />}
    </Shell>
  )
}

const FLOWS = {
  employee: EmployeeFlow,
  organization: OrganizationFlow,
  contract: ContractFlow,
  team: TeamFlow,
  skill: SkillFlow,
  shift: ShiftFlow,
  request: RequestFlow,
  ticket: TicketFlow,
  'payment-rule': PaymentRuleFlow,
  'exchange-rate': ExchangeRateFlow,
  payroll: PayrollFlow,
  overtime: OvertimeFlow,
  invoice: InvoiceFlow,
  'contract-rule': ContractRuleFlow,
}

/** One page for every "add" screen; `type` (set by the route) says which form to show. */
function NewItemPage({ type }) {
  const Flow = FLOWS[type]
  return Flow ? <Flow /> : null
}

export default NewItemPage
