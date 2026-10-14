import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { ROLES } from '../constants/roles.js'
import GuestRoute from './GuestRoute.jsx'
import ProtectedRoute from './ProtectedRoute.jsx'
import Spinner from '../components/ui/Spinner.jsx'
import AuthLayout from '../layouts/AuthLayout.jsx'
import LoginPage from '../portals/auth/pages/LoginPage.jsx'
import ForgotPasswordPage from '../portals/auth/pages/ForgotPasswordPage.jsx'
import VerifyOtpPage from '../portals/auth/pages/VerifyOtpPage.jsx'
import ResetPasswordPage from '../portals/auth/pages/ResetPasswordPage.jsx'
import NotFoundPage from '../portals/common/NotFoundPage.jsx'

// The Admin portal is loaded on demand, so the login page stays small and fast.
const AdminLayout = lazy(() => import('../layouts/AdminLayout.jsx'))
const page = (name) => lazy(() => import(`../portals/admin/pages/${name}.jsx`))

const AdminDashboardPage = page('AdminDashboardPage')
const OrganizationsPage = page('OrganizationsPage')
const OrganizationDetailsPage = page('OrganizationDetailsPage')
const ContractsPage = page('ContractsPage')
const ContractDetailsPage = page('ContractDetailsPage')
const EmployeesPage = page('EmployeesPage')
const EmployeeDetailsPage = page('EmployeeDetailsPage')
const SkillsPage = page('SkillsPage')
const ShiftsPage = page('ShiftsPage')
const ShiftDetailsPage = page('ShiftDetailsPage')
const TeamPage = page('TeamPage')
const AllocationsPage = page('AllocationsPage')
const AllocationHistoryPage = page('AllocationHistoryPage')
const AvailabilityPage = page('AvailabilityPage')
const InvoicesPage = page('InvoicesPage')
const InvoiceDetailsPage = page('InvoiceDetailsPage')
const SalariesPage = page('SalariesPage')
const PayrollPage = page('PayrollPage')
const PayrollDetailsPage = page('PayrollDetailsPage')
const PaymentRulesPage = page('PaymentRulesPage')
const TicketsPage = page('TicketsPage')
const TicketDetailsPage = page('TicketDetailsPage')
const AuditLogsPage = page('AuditLogsPage')
const ReportsPage = page('ReportsPage')
const StaffRequestsPage = page('StaffRequestsPage')
const StaffRequestDetailsPage = page('StaffRequestDetailsPage')
const SettingsPage = page('SettingsPage')
const NewItemPage = page('NewItemPage')

function AppRouter() {
  return (
    <Suspense fallback={<Spinner fullPage label="Loading..." />}>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />

        <Route element={<AuthLayout />}>
          <Route element={<GuestRoute />}>
            <Route path="/login" element={<LoginPage />} />
          </Route>
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/verify-otp" element={<VerifyOtpPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
        </Route>

        <Route element={<ProtectedRoute roles={[ROLES.ADMIN]} />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<AdminDashboardPage />} />

            <Route path="organizations" element={<OrganizationsPage />} />
            <Route path="organizations/:organizationId" element={<OrganizationDetailsPage />} />
            <Route path="contracts" element={<ContractsPage />} />
            <Route path="contracts/:contractId" element={<ContractDetailsPage />} />

            <Route path="employees" element={<EmployeesPage />} />
            <Route path="employees/:employeeId" element={<EmployeeDetailsPage />} />
            <Route path="skills" element={<SkillsPage />} />
            <Route path="shifts" element={<ShiftsPage />} />
            <Route path="shifts/:shiftId" element={<ShiftDetailsPage />} />
            <Route path="team" element={<TeamPage />} />

            <Route path="allocations" element={<AllocationsPage />} />
            <Route path="allocation-history" element={<AllocationHistoryPage />} />
            <Route path="availability" element={<AvailabilityPage />} />

            <Route path="invoices" element={<InvoicesPage />} />
            <Route path="invoices/:invoiceId" element={<InvoiceDetailsPage />} />
            <Route path="salaries" element={<SalariesPage />} />
            <Route path="payroll" element={<PayrollPage />} />
            <Route path="payroll/:payrollId" element={<PayrollDetailsPage />} />
            <Route path="payment-rules" element={<PaymentRulesPage />} />
            <Route path="tickets" element={<TicketsPage />} />
            <Route path="tickets/:ticketId" element={<TicketDetailsPage />} />
            <Route path="audit-logs" element={<AuditLogsPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="requests" element={<StaffRequestsPage />} />
            <Route path="requests/:requestId" element={<StaffRequestDetailsPage />} />
            <Route path="settings" element={<SettingsPage />} />

            {/* Every "add" screen is a page of its own and returns to its list after saving. */}
            <Route path="employees/new" element={<NewItemPage type="employee" />} />
            <Route path="organizations/new" element={<NewItemPage type="organization" />} />
            <Route path="contracts/new" element={<NewItemPage type="contract" />} />
            <Route path="contracts/:contractId/rules/new" element={<NewItemPage type="contract-rule" />} />
            <Route path="team/new" element={<NewItemPage type="team" />} />
            <Route path="skills/new" element={<NewItemPage type="skill" />} />
            <Route path="shifts/new" element={<NewItemPage type="shift" />} />
            <Route path="requests/new" element={<NewItemPage type="request" />} />
            <Route path="tickets/new" element={<NewItemPage type="ticket" />} />
            <Route path="payment-rules/new" element={<NewItemPage type="payment-rule" />} />
            <Route path="payment-rules/new-rate" element={<NewItemPage type="exchange-rate" />} />
            <Route path="payroll/new" element={<NewItemPage type="payroll" />} />
            <Route path="payroll/new-overtime" element={<NewItemPage type="overtime" />} />
            <Route path="invoices/new" element={<NewItemPage type="invoice" />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  )
}

export default AppRouter
