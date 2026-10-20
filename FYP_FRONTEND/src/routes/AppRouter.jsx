import { billingMailApi } from '../services/admin/adminService.js'
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
const OrganizationLayout = lazy(() => import('../portals/organization/layout/OrganizationLayout.jsx'))
const OrganizationDashboardPage = lazy(() => import('../portals/organization/dashboard/OrganizationDashboardPage.jsx'))
const OrganizationContractsPage = lazy(() => import('../portals/organization/contracts/OrganizationContractsPage.jsx'))
const OrganizationContractDetailsPage = lazy(() => import('../portals/organization/contracts/OrganizationContractDetailsPage.jsx'))
const OrganizationRequestsPage = lazy(() => import('../portals/organization/requests/OrganizationRequestsPage.jsx'))
const OrganizationRequestDetailsPage = lazy(() => import('../portals/organization/requests/OrganizationRequestDetailsPage.jsx'))
const ManagerMinimumStaffPage = lazy(() => import('../portals/manager/minimum/ManagerMinimumStaffPage.jsx'))
const OrganizationChatPage = lazy(() => import('../portals/organization/chat/OrganizationChatPage.jsx'))
const OrganizationEmployeesPage = lazy(() => import('../portals/organization/employees/OrganizationEmployeesPage.jsx'))
const OrganizationEmployeeDetailsPage = lazy(() => import('../portals/organization/employees/OrganizationEmployeeDetailsPage.jsx'))
const ManagerReviewsPage = lazy(() => import('../portals/manager/reviews/ManagerReviewsPage.jsx'))
const ManagerReviewDetailsPage = lazy(() => import('../portals/manager/reviews/ManagerReviewDetailsPage.jsx'))
const ReviewRequestsPage = lazy(() => import('../portals/admin/reviews/ReviewRequestsPage.jsx'))
const OrganizationInvoicesPage = lazy(() => import('../portals/organization/billing/OrganizationInvoicesPage.jsx'))
const OrganizationInvoiceDetailsPage = lazy(() => import('../portals/organization/billing/OrganizationInvoiceDetailsPage.jsx'))
const OrganizationReportsPage = lazy(() => import('../portals/organization/reports/OrganizationReportsPage.jsx'))
const OrganizationSettingsPage = lazy(() => import('../portals/organization/settings/OrganizationSettingsPage.jsx'))
const OrganizationTeamPage = lazy(() => import('../portals/organization/team/OrganizationTeamPage.jsx'))
const ManagerCallsPage = lazy(() => import('../portals/manager/calls/ManagerCallsPage.jsx'))
const ManagerOffersPage = lazy(() => import('../portals/manager/offers/ManagerOffersPage.jsx'))
const EmployeeAssignmentsPage = lazy(() => import('../portals/employee/assignments/EmployeeAssignmentsPage.jsx'))
const DocumentViewerPage = lazy(() => import('../components/documents/DocumentViewerPage.jsx'))
const ProfitStatementPage = lazy(() => import('../components/documents/ProfitStatementPage.jsx'))
const DemoCheckoutPage = lazy(() => import('../portals/common/DemoCheckoutPage.jsx'))
const VerifyDocumentPage = lazy(() => import('../portals/common/VerifyDocumentPage.jsx'))
const AdminPaymentsPage = lazy(() => import('../portals/admin/finance/PaymentsPage.jsx'))
const AdminPaymentSubmissionsPage = lazy(() => import('../portals/admin/finance/PaymentSubmissionsPage.jsx'))
const AdminStatementsPage = lazy(() => import('../portals/admin/finance/StatementsPage.jsx'))
const ManagerPaymentNoticesPage = lazy(() => import('../portals/manager/billing/ManagerPaymentNoticesPage.jsx'))
const ManagerReceivablesPage = lazy(() => import('../portals/manager/billing/ManagerReceivablesPage.jsx'))
const ManagerStatementsPage = lazy(() => import('../portals/manager/billing/ManagerStatementsPage.jsx'))
const OrganizationPaymentsPage = lazy(() => import('../portals/organization/billing/OrganizationPaymentsPage.jsx'))
const OrganizationStatementsPage = lazy(() => import('../portals/organization/billing/OrganizationStatementsPage.jsx'))
const OrganizationLoginPage = lazy(() => import('../portals/organization/auth/OrganizationLoginPage.jsx'))
const OrganizationRegisterPage = lazy(() => import('../portals/organization/auth/OrganizationRegisterPage.jsx'))
const OrganizationForgotPasswordPage = lazy(() => import('../portals/organization/auth/OrganizationForgotPasswordPage.jsx'))
const OrganizationVerifyOtpPage = lazy(() => import('../portals/organization/auth/OrganizationVerifyOtpPage.jsx'))
const OrganizationResetPasswordPage = lazy(() => import('../portals/organization/auth/OrganizationResetPasswordPage.jsx'))
const OwnerLayout = lazy(() => import('../portals/businessOwner/layout/OwnerLayout.jsx'))
const OwnerDashboardPage = lazy(() => import('../portals/businessOwner/dashboard/OwnerDashboardPage.jsx'))
const OwnerEmployeesPage = lazy(() => import('../portals/businessOwner/employees/OwnerEmployeesPage.jsx'))
const OwnerSettingsPage = lazy(() => import('../portals/businessOwner/settings/OwnerSettingsPage.jsx'))
const EmployeeLayout = lazy(() => import('../portals/employee/layout/EmployeeLayout.jsx'))
const EmployeeDashboardPage = lazy(() => import('../portals/employee/dashboard/EmployeeDashboardPage.jsx'))
const EmployeeQueriesPage = lazy(() => import('../portals/employee/queries/EmployeeQueriesPage.jsx'))
const EmployeeQueryDetailsPage = lazy(() => import('../portals/employee/queries/EmployeeQueryDetailsPage.jsx'))
const EmployeeShiftsPage = lazy(() => import('../portals/employee/shifts/EmployeeShiftsPage.jsx'))
const EmployeeSalaryPage = lazy(() => import('../portals/employee/salary/EmployeeSalaryPage.jsx'))
const EmployeeHoursPage = lazy(() => import('../portals/employee/hours/EmployeeHoursPage.jsx'))
const EmployeeCallsPage = lazy(() => import('../portals/employee/calls/EmployeeCallsPage.jsx'))
const EmployeeSettingsPage = lazy(() => import('../portals/employee/settings/EmployeeSettingsPage.jsx'))
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
            <Route path="/organization/login" element={<OrganizationLoginPage />} />
            <Route path="/organization/register" element={<OrganizationRegisterPage />} />
          </Route>
          <Route path="/organization/forgot-password" element={<OrganizationForgotPasswordPage />} />
          <Route path="/organization/verify-otp" element={<OrganizationVerifyOtpPage />} />
          <Route path="/organization/reset-password" element={<OrganizationResetPasswordPage />} />
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
            <Route path="review-requests" element={<ReviewRequestsPage />} />
            <Route path="payments" element={<AdminPaymentsPage />} />
            <Route path="payment-submissions" element={<AdminPaymentSubmissionsPage />} />
            <Route path="statements" element={<AdminStatementsPage />} />
            <Route path="documents/invoice/:id" element={<DocumentViewerPage kind="invoice" backTo={(id) => `/admin/invoices/${id}`} backLabel="Back to the invoice" emailAction={{ label: 'Email to the organization', run: (id) => billingMailApi.invoice(id) }} />} />
            <Route path="documents/receipt/:id" element={<DocumentViewerPage kind="receipt" backTo={(id, doc) => (doc ? `/admin/invoices/${doc.invoice.invoiceId}` : '/admin/payments')} backLabel="Back to the invoice" emailAction={{ label: 'Email receipt', run: (id) => billingMailApi.receipt(id) }} />} />
            <Route path="documents/payslip/:id" element={<DocumentViewerPage kind="payslip" backTo="/admin/payroll" backLabel="Back to Payroll" />} />
            <Route path="documents/payroll/:id" element={<DocumentViewerPage kind="payroll" backTo={(id) => `/admin/payroll/${id}`} backLabel="Back to the payroll" />} />
            <Route path="requests" element={<StaffRequestsPage />} />
            <Route path="requests/:requestId" element={<StaffRequestDetailsPage />} />
            <Route path="settings" element={<SettingsPage />} />

            {/* Every "add" screen is a page of its own and returns to its list after saving. */}
            <Route path="employees/new" element={<NewItemPage type="employee" />} />
            <Route path="organizations/new" element={<NewItemPage type="organization" />} />
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
            <Route path="payment-submissions" element={<ManagerPaymentNoticesPage />} />
            <Route path="receivables" element={<ManagerReceivablesPage />} />
            <Route path="statements" element={<ManagerStatementsPage />} />
            <Route path="documents/invoice/:id" element={<DocumentViewerPage kind="invoice" backTo={(id) => `/manager/invoices/${id}`} backLabel="Back to the invoice" />} />
            <Route path="documents/receipt/:id" element={<DocumentViewerPage kind="receipt" backTo={(id, doc) => (doc ? `/manager/invoices/${doc.invoice.invoiceId}` : '/manager/payments')} backLabel="Back to the invoice" />} />
            <Route path="documents/payslip/:id" element={<DocumentViewerPage kind="payslip" backTo="/manager/salaries" backLabel="Back to Salary Status" />} />
            <Route path="reviews" element={<ManagerReviewsPage />} />
            <Route path="reviews/:reviewId" element={<ManagerReviewDetailsPage />} />
            <Route path="requests" element={<ManagerRequestsPage />} />
            <Route path="requests/:requestId" element={<ManagerRequestDetailsPage />} />
            <Route path="salaries" element={<ManagerSalariesPage />} />
            <Route path="employees/:employeeId" element={<ManagerEmployeeDetailsPage />} />
            <Route path="minimum-staff" element={<ManagerMinimumStaffPage />} />
            <Route path="organizations" element={<ManagerOrganizationsPage />} />
            <Route path="organizations/:orgId" element={<ManagerOrganizationDetailsPage />} />
            <Route path="chat" element={<ManagerChatPage />} />
            <Route path="calls" element={<ManagerCallsPage />} />
            <Route path="offers" element={<ManagerOffersPage />} />
            <Route path="performance" element={<ManagerPerformancePage />} />
            <Route path="queries" element={<ManagerQueriesPage />} />
            <Route path="queries/:ticketId" element={<ManagerQueryDetailsPage />} />
            <Route path="invoices" element={<ManagerInvoicesPage />} />
            <Route path="invoices/:invoiceId" element={<ManagerInvoiceDetailsPage />} />
            <Route path="payments" element={<ManagerPaymentsPage />} />
            <Route path="settings" element={<ManagerSettingsPage />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute roles={[ROLES.EMPLOYEE]} />}>
          <Route path="/employee" element={<EmployeeLayout />}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<EmployeeDashboardPage />} />
            <Route path="shifts" element={<EmployeeShiftsPage />} />
            <Route path="salary" element={<EmployeeSalaryPage />} />
            <Route path="hours" element={<EmployeeHoursPage />} />
            <Route path="calls" element={<EmployeeCallsPage />} />
            <Route path="documents/payslip/:id" element={<DocumentViewerPage kind="payslip" backTo="/employee/salary" backLabel="Back to My Salary" />} />
            <Route path="assignments" element={<EmployeeAssignmentsPage />} />
            <Route path="settings" element={<EmployeeSettingsPage />} />
            <Route path="queries" element={<EmployeeQueriesPage />} />
            <Route path="queries/:ticketId" element={<EmployeeQueryDetailsPage />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute roles={[ROLES.BUSINESS_OWNER]} />}>
          <Route path="/owner" element={<OwnerLayout />}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<OwnerDashboardPage />} />
            <Route path="employees" element={<OwnerEmployeesPage />} />
            <Route path="statements" element={<ProfitStatementPage backTo="/owner/dashboard" backLabel="Back to the dashboard" />} />
            <Route path="settings" element={<OwnerSettingsPage />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute roles={[ROLES.ORGANIZATION]} />}>
          <Route path="/organization" element={<OrganizationLayout />}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<OrganizationDashboardPage />} />
            <Route path="contracts" element={<OrganizationContractsPage />} />
            <Route path="contracts/:contractId" element={<OrganizationContractDetailsPage />} />
            <Route path="chat" element={<OrganizationChatPage />} />
            <Route path="team" element={<OrganizationTeamPage />} />
            <Route path="settings" element={<OrganizationSettingsPage />} />
            <Route path="invoices" element={<OrganizationInvoicesPage />} />
            <Route path="invoices/:invoiceId" element={<OrganizationInvoiceDetailsPage />} />
            <Route path="reports" element={<OrganizationReportsPage />} />
            <Route path="payments" element={<OrganizationPaymentsPage />} />
            <Route path="statements" element={<OrganizationStatementsPage />} />
            <Route path="documents/invoice/:id" element={<DocumentViewerPage kind="invoice" backTo={(id) => `/organization/invoices/${id}`} backLabel="Back to the invoice" />} />
            <Route path="documents/receipt/:id" element={<DocumentViewerPage kind="receipt" backTo={(id, doc) => (doc ? `/organization/invoices/${doc.invoice.invoiceId}` : '/organization/payments')} backLabel="Back to the invoice" />} />
            <Route path="employees" element={<OrganizationEmployeesPage />} />
            <Route path="employees/:employeeId" element={<OrganizationEmployeeDetailsPage />} />
            <Route path="requests" element={<OrganizationRequestsPage />} />
            <Route path="requests/:requestId" element={<OrganizationRequestDetailsPage />} />
          </Route>
        </Route>

        <Route path="/verify/:kind/:number" element={<VerifyDocumentPage />} />
        <Route path="/pay/demo/:token" element={<DemoCheckoutPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  )
}

export default AppRouter
