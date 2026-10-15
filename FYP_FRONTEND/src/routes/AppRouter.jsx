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
const AdminLayout = lazy(() => import('../portals/admin/layout/AdminLayout.jsx'))
const ManagerLayout = lazy(() => import('../portals/manager/layout/ManagerLayout.jsx'))
const ManagerDashboardPage = lazy(() => import('../portals/manager/dashboard/ManagerDashboardPage.jsx'))
const ManagerInvoicesPage = lazy(() => import('../portals/manager/billing/ManagerInvoicesPage.jsx'))
const ManagerInvoiceDetailsPage = lazy(() => import('../portals/manager/billing/ManagerInvoiceDetailsPage.jsx'))
const ManagerPaymentsPage = lazy(() => import('../portals/manager/billing/ManagerPaymentsPage.jsx'))
const ManagerSettingsPage = lazy(() => import('../portals/manager/settings/ManagerSettingsPage.jsx'))
const ManagerChatPage = lazy(() => import('../portals/manager/chat/ManagerChatPage.jsx'))
const ManagerQueriesPage = lazy(() => import('../portals/manager/queries/ManagerQueriesPage.jsx'))
const ManagerQueryDetailsPage = lazy(() => import('../portals/manager/queries/ManagerQueryDetailsPage.jsx'))
const ManagerPerformancePage = lazy(() => import('../portals/manager/performance/ManagerPerformancePage.jsx'))
const ManagerOrganizationsPage = lazy(() => import('../portals/manager/organizations/ManagerOrganizationsPage.jsx'))
const ManagerOrganizationDetailsPage = lazy(() => import('../portals/manager/organizations/ManagerOrganizationDetailsPage.jsx'))
const ManagerEmployeeDetailsPage = lazy(() => import('../portals/manager/employees/ManagerEmployeeDetailsPage.jsx'))
const ManagerSalariesPage = lazy(() => import('../portals/manager/salaries/ManagerSalariesPage.jsx'))
const ManagerRequestsPage = lazy(() => import('../portals/manager/requests/ManagerRequestsPage.jsx'))
const ManagerRequestDetailsPage = lazy(() => import('../portals/manager/requests/ManagerRequestDetailsPage.jsx'))
const ManagerEmployeePoolPage = lazy(() => import('../portals/manager/allocations/ManagerEmployeePoolPage.jsx'))

const AdminDashboardPage = lazy(() => import('../portals/admin/dashboard/AdminDashboardPage.jsx'))
const OrganizationsPage = lazy(() => import('../portals/admin/organizations/OrganizationsPage.jsx'))
const OrganizationDetailsPage = lazy(() => import('../portals/admin/organizations/OrganizationDetailsPage.jsx'))
const ContractsPage = lazy(() => import('../portals/admin/contracts/ContractsPage.jsx'))
const ContractDetailsPage = lazy(() => import('../portals/admin/contracts/ContractDetailsPage.jsx'))
const EmployeesPage = lazy(() => import('../portals/admin/employees/EmployeesPage.jsx'))
const EmployeeDetailsPage = lazy(() => import('../portals/admin/employees/EmployeeDetailsPage.jsx'))
const SkillsPage = lazy(() => import('../portals/admin/skills/SkillsPage.jsx'))
const ShiftsPage = lazy(() => import('../portals/admin/shifts/ShiftsPage.jsx'))
const ShiftDetailsPage = lazy(() => import('../portals/admin/shifts/ShiftDetailsPage.jsx'))
const TeamPage = lazy(() => import('../portals/admin/team/TeamPage.jsx'))
const AllocationsPage = lazy(() => import('../portals/admin/allocations/AllocationsPage.jsx'))
const AllocationHistoryPage = lazy(() => import('../portals/admin/allocations/AllocationHistoryPage.jsx'))
const AvailabilityPage = lazy(() => import('../portals/admin/allocations/AvailabilityPage.jsx'))
const InvoicesPage = lazy(() => import('../portals/admin/finance/InvoicesPage.jsx'))
const InvoiceDetailsPage = lazy(() => import('../portals/admin/finance/InvoiceDetailsPage.jsx'))
const SalariesPage = lazy(() => import('../portals/admin/finance/SalariesPage.jsx'))
const PayrollPage = lazy(() => import('../portals/admin/finance/PayrollPage.jsx'))
const PayrollDetailsPage = lazy(() => import('../portals/admin/finance/PayrollDetailsPage.jsx'))
const PaymentRulesPage = lazy(() => import('../portals/admin/finance/PaymentRulesPage.jsx'))
const TicketsPage = lazy(() => import('../portals/admin/queries/TicketsPage.jsx'))
const TicketDetailsPage = lazy(() => import('../portals/admin/queries/TicketDetailsPage.jsx'))
const AuditLogsPage = lazy(() => import('../portals/admin/audit/AuditLogsPage.jsx'))
const ReportsPage = lazy(() => import('../portals/admin/reports/ReportsPage.jsx'))
const StaffRequestsPage = lazy(() => import('../portals/admin/requests/StaffRequestsPage.jsx'))
const StaffRequestDetailsPage = lazy(() => import('../portals/admin/requests/StaffRequestDetailsPage.jsx'))
const SettingsPage = lazy(() => import('../portals/admin/settings/SettingsPage.jsx'))
const NewItemPage = lazy(() => import('../portals/admin/new-item/NewItemPage.jsx'))

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

        <Route element={<ProtectedRoute roles={[ROLES.ORGANIZATION_MANAGER]} />}>
          <Route path="/manager" element={<ManagerLayout />}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<ManagerDashboardPage />} />
            <Route path="employee-pool" element={<ManagerEmployeePoolPage />} />
            <Route path="requests" element={<ManagerRequestsPage />} />
            <Route path="requests/:requestId" element={<ManagerRequestDetailsPage />} />
            <Route path="salaries" element={<ManagerSalariesPage />} />
            <Route path="employees/:employeeId" element={<ManagerEmployeeDetailsPage />} />
            <Route path="organizations" element={<ManagerOrganizationsPage />} />
            <Route path="organizations/:orgId" element={<ManagerOrganizationDetailsPage />} />
            <Route path="chat" element={<ManagerChatPage />} />
            <Route path="performance" element={<ManagerPerformancePage />} />
            <Route path="queries" element={<ManagerQueriesPage />} />
            <Route path="queries/:ticketId" element={<ManagerQueryDetailsPage />} />
            <Route path="invoices" element={<ManagerInvoicesPage />} />
            <Route path="invoices/:invoiceId" element={<ManagerInvoiceDetailsPage />} />
            <Route path="payments" element={<ManagerPaymentsPage />} />
            <Route path="settings" element={<ManagerSettingsPage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  )
}

export default AppRouter
