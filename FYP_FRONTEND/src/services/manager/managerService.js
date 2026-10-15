import { apiRequest } from '../apiClient.js'

// Endpoints from FYP_BACKEND/fyp_project/Controllers/Manager (Organization Manager role only).

export const managerNotificationsApi = {
  /** { enabled, unreadCount, alerts: [{ title, message, link }], items: [{ id, action, title, message, actorName, entityType, entityId, createdAt, isUnread }] } */
  feed: (limit, signal) => apiRequest('/api/manager/notifications', { params: { limit }, signal }),
  readAll: () => apiRequest('/api/manager/notifications/read-all', { method: 'POST' }),
}

export const managerApi = {
  /** { fullName, email, organizations: [{ organizationId, name, email, status }] } */
  overview: (signal) => apiRequest('/api/manager/overview', { signal }),
  /**
   * Dashboard numbers for the manager's own organizations: { fullName, organizations, activeOrganizations, pendingOrganizations,
   * employeesWorking, freeEmployees, activeContracts, pendingRequests, openQueries, availability: [{ status, count }],
   * employeesByOrganization: [{ organizationId, name, count }], recentActivity: [...] }
   */
  dashboard: (signal) => apiRequest('/api/manager/dashboard', { signal }),
}

export const managerInfoApi = {
  /** [{ organizationId, name, email, phone, country, status, employeesWorking, openTickets, contract }] */
  organizations: (signal) => apiRequest('/api/manager/organizations', { signal }),
  /** One of my organizations: information, contract, managers, employees working there, open query counts. */
  organization: (orgId, signal) => apiRequest(`/api/manager/organizations/${orgId}`, { signal }),
  /** One employee: where they work, skills, shift, history with my organizations, queries. Contact details only for my own employees; never pay or CNIC. */
  employee: (employeeId, signal) => apiRequest(`/api/manager/employees/${employeeId}`, { signal }),
}

export const managerSalariesApi = {
  /**
   * params: { year, month, search, organizationId, status ('Paid' | 'Approved' | 'Draft' | 'NotProcessed'), page, pageSize }
   * -> { items: [{ employeeId, fullName, orgName, monthlySalary, salaryCurrency, status, statusLabel, totalAmount, payrollCurrency, paidAt ... }], total, summary }
   */
  list: (params, signal) => apiRequest('/api/manager/salaries', { params, signal }),
  /** One of my employees, the last 12 months: { fullName, monthlySalary, currency, months: [{ year, month, status, statusLabel, totalAmount, ... }] } */
  employee: (employeeId, signal) => apiRequest(`/api/manager/salaries/employees/${employeeId}`, { signal }),
}

export const managerRequestsApi = {
  /** { waitingForAdmin, approvedShort, fullyStaffed, rejected } */
  summary: (signal) => apiRequest('/api/manager/requests/summary', { signal }),
  /** params: { search, status ('Pending' | 'Approved' | 'Rejected' | 'Cancelled' | 'Unstaffed'), priority, orgId, page, pageSize } */
  list: (params, signal) => apiRequest('/api/manager/requests', { params, signal }),
  /** One request: staffing numbers, contract min/max, allocations, the admin's decision, canStaff */
  get: (requestId, signal) => apiRequest(`/api/manager/requests/${requestId}`, { signal }),
  /** The free employees in the pool, best fit first: [{ employeeId, fullName, availabilityStatus, rating, homeOrgName, isBorrowed, matchesSkill, skills }] */
  candidates: (requestId, search, signal) => apiRequest(`/api/manager/requests/${requestId}/candidates`, { params: { search }, signal }),
  /** Manual allocation to an approved request. -> { message, allocated, results: [{ employeeId, name, ok, message }] } */
  staff: (requestId, employeeIds) => apiRequest(`/api/manager/requests/${requestId}/staff`, { method: 'POST', body: { employeeIds } }),
  /** body: { organizationId, requiredEmployees, skillId?, priority, startDatetime, endDatetime, reason } - the admin decides on it */
  create: (body) => apiRequest('/api/manager/requests', { method: 'POST', body }),
}

export const managerBillingApi = {
  /** { currencies: [{ currency, invoiced, paid, outstanding, overdueInvoices }], invoiceCount, unverifiedInvoices, unverifiedPayments } */
  summary: (signal) => apiRequest('/api/manager/billing/summary', { signal }),
  /** params: { search, status, organizationId, verified, page, pageSize } -> { items, total, page, pageSize } (drafts are never listed) */
  invoices: (params, signal) => apiRequest('/api/manager/billing/invoices', { params, signal }),
  invoice: (invoiceId, signal) => apiRequest(`/api/manager/billing/invoices/${invoiceId}`, { signal }),
  verifyInvoice: (invoiceId) => apiRequest(`/api/manager/billing/invoices/${invoiceId}/verify`, { method: 'POST' }),
  /** params: { search, organizationId, verified, page, pageSize } */
  payments: (params, signal) => apiRequest('/api/manager/billing/payments', { params, signal }),
  verifyPayment: (paymentId) => apiRequest(`/api/manager/billing/payments/${paymentId}/verify`, { method: 'POST' }),
}

export const managerTicketsApi = {
  /** { openQueries, openComplaints, openEmployeeQueries, severeToSend, notSentToAdmin, sentToAdmin, resolved } */
  summary: (signal) => apiRequest('/api/manager/tickets/summary', { signal }),
  /** params: { search, category ('Query' | 'Complaint'), source ('Employee' | 'Organization'), status ('Open' | 'Resolved'), organizationId, forwarded, severe, page, pageSize } */
  list: (params, signal) => apiRequest('/api/manager/tickets', { params, signal }),
  get: (ticketId, signal) => apiRequest(`/api/manager/tickets/${ticketId}`, { signal }),
  /** The employees a query can be logged for: [{ employeeId, fullName, orgId, orgName }] */
  employees: (signal) => apiRequest('/api/manager/tickets/employees', { signal }),
  /** body: { organizationId | employeeId, category ('Query' | 'Complaint'), subject, description, priority, sendToAdmin, note } */
  create: (body) => apiRequest('/api/manager/tickets', { method: 'POST', body }),
  /** Sends it to the admin. note is optional; priority (Low | Medium | High | Critical) is the severity the manager judges it to have. */
  forward: (ticketId, note, priority) => apiRequest(`/api/manager/tickets/${ticketId}/forward`, { method: 'POST', body: { note, priority } }),
  /** The manager answers an employee's query that is not severe; the employee is emailed the answer. */
  resolve: (ticketId, comment) => apiRequest(`/api/manager/tickets/${ticketId}/resolve`, { method: 'POST', body: { comment } }),
}

export const managerAllocationsApi = {
  /** [{ skillId, name }] to filter the pool by */
  skills: (signal) => apiRequest('/api/manager/allocations/skills', { signal }),
  /**
   * params: { search, availability, skillId, view ('' all | 'free' | 'mine'), page, pageSize }
   * -> { items: [{ employeeId, userId, hasPicture, fullName, email, availabilityStatus, rating, homeOrgName, skills, shiftName,
   *      isAllocated, allocationId, workingOrgId, workingOrgName, canManage }], total, page, pageSize }
   */
  pool: (params, signal) => apiRequest('/api/manager/allocations/pool', { params, signal }),
  /** body: { employeeId, organizationId, reason, expectedEnd? } */
  assign: (body) => apiRequest('/api/manager/allocations', { method: 'POST', body }),
  /** body: { organizationId, reason, expectedEnd? } - moves an employee to another of the manager's organizations */
  move: (allocationId, body) => apiRequest(`/api/manager/allocations/${allocationId}/move`, { method: 'POST', body }),
  /** body: { reason } - removes the employee from the organization; they are available in the pool again */
  release: (allocationId, body) => apiRequest(`/api/manager/allocations/${allocationId}/release`, { method: 'POST', body }),
}

export const managerSettingsApi = {
  /** { userId, fullName, email, phone, roleName, organizations: [{ organizationId, name, status }] } */
  profile: (signal) => apiRequest('/api/manager/settings/profile', { signal }),
  /** body: { fullName, phone } -> { message, user } */
  updateProfile: (body) => apiRequest('/api/manager/settings/profile', { method: 'PUT', body }),
  /** body: { currentPassword, newPassword } */
  changePassword: (body) => apiRequest('/api/manager/settings/password', { method: 'POST', body }),
  /** { signedInAt, previousSignInAt } */
  security: (signal) => apiRequest('/api/manager/settings/security', { signal }),
  /** { inApp, requests, queries, invoices, employees, chat, expiry, expiryDays (null = system value), systemExpiryDays, systemInAppEnabled } */
  notifications: (signal) => apiRequest('/api/manager/settings/notifications', { signal }),
  saveNotifications: (body) => apiRequest('/api/manager/settings/notifications', { method: 'PUT', body }),
}
