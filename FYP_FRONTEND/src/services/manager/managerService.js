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
  /** { waiting (waiting for the manager's decision), approvedShort, fullyStaffed, rejected } */
  summary: (signal) => apiRequest('/api/manager/requests/summary', { signal }),
  /** params: { search, status ('Pending' | 'Approved' | 'Rejected' | 'Cancelled' | 'Unstaffed'), priority, orgId, page, pageSize } */
  list: (params, signal) => apiRequest('/api/manager/requests', { params, signal }),
  /** One request: staffing numbers, contract min/max, allocations, the admin's decision, canStaff */
  get: (requestId, signal) => apiRequest(`/api/manager/requests/${requestId}`, { signal }),
  /** The free employees in the pool, best fit first: [{ employeeId, fullName, availabilityStatus, rating, homeOrgName, isBorrowed, matchesSkill, skills }] */
  candidates: (requestId, search, signal) => apiRequest(`/api/manager/requests/${requestId}/candidates`, { params: { search }, signal }),
  /** Manual allocation to an approved request. -> { message, allocated, results: [{ employeeId, name, ok, message }] } */
  staff: (requestId, employeeIds) => apiRequest(`/api/manager/requests/${requestId}/staff`, { method: 'POST', body: { employeeIds } }),
  /** body: { organizationId, requiredEmployees, skillId?, priority, startDatetime, endDatetime, reason } - the manager decides, so it is approved at once */
  create: (body) => apiRequest('/api/manager/requests', { method: 'POST', body }),
  /** The manager approves a request of the organization (it then waits for employees). */
  approve: (requestId, note) => apiRequest(`/api/manager/requests/${requestId}/approve`, { method: 'POST', body: { note } }),
  /** The reason is required: the organization sees it. */
  reject: (requestId, note) => apiRequest(`/api/manager/requests/${requestId}/reject`, { method: 'POST', body: { note } }),
}

export const managerOffersApi = {
  /** Forward an approved staff request to employees of the pool. They accept or decline. -> { message, sent, results: [{ employeeId, name, ok, message }] } */
  forRequest: (requestId, employeeIds) => apiRequest(`/api/manager/offers/requests/${requestId}`, { method: 'POST', body: { employeeIds } }),
  /** Forward the minimum staff of an active contract to employees of the pool. */
  forMinimum: (contractId, employeeIds) => apiRequest(`/api/manager/offers/minimum/${contractId}`, { method: 'POST', body: { employeeIds } }),
  /** status: 'Pending' | 'Accepted' | 'Declined' | 'Cancelled' | 'Expired' | 'Failed' (empty = all) -> [{ offerId, kind, requestId, contractId, orgName, employeeId, employeeName, status, note, createdAt, respondedAt }] */
  list: (status, signal) => apiRequest('/api/manager/offers', { params: { status }, signal }),
  cancel: (offerId) => apiRequest(`/api/manager/offers/${offerId}/cancel`, { method: 'POST' }),
}

export const managerReviewsApi = {
  /** { total, badToHandle, warned, escalated, average } */
  summary: (signal) => apiRequest('/api/manager/reviews/summary', { signal }),
  /** params: { search, status ('New' | 'Warned' | 'Escalated' | 'Dismissed' | 'Resolved'), bad (true), orgId, page, pageSize } -> { items, total, page, pageSize } */
  list: (params, signal) => apiRequest('/api/manager/reviews', { params, signal }),
  get: (reviewId, signal) => apiRequest(`/api/manager/reviews/${reviewId}`, { signal }),
  /** The employee is warned (notification + email). */
  warn: (reviewId, message) => apiRequest(`/api/manager/reviews/${reviewId}/warn`, { method: 'POST', body: { message } }),
  dismiss: (reviewId, note) => apiRequest(`/api/manager/reviews/${reviewId}/dismiss`, { method: 'POST', body: { note } }),
  /** Asks the admin to act (warn / deactivate / nothing). */
  escalate: (reviewId, message) => apiRequest(`/api/manager/reviews/${reviewId}/escalate`, { method: 'POST', body: { message } }),
}

export const managerMinimumStaffingApi = {
  /**
   * Every active contract of my organizations: [{ contractId, contractNumber, orgId, orgName, isDaily, window, min, max, appointed, missing, extraNow,
   * borrowingAllowed, canStaff, hint, staff: [{ allocationId, employeeId, name, since, until }] }]
   */
  list: (signal) => apiRequest('/api/manager/minimum-staffing', { signal }),
  /** The free employees (the contract's borrowing rule applied): [{ employeeId, fullName, availabilityStatus, rating, homeOrgName, isBorrowed, skills }] */
  candidates: (contractId, search, signal) => apiRequest(`/api/manager/minimum-staffing/${contractId}/candidates`, { params: { search }, signal }),
  /** -> { message, appointed, results: [{ employeeId, name, ok, message }] } */
  staff: (contractId, employeeIds) => apiRequest(`/api/manager/minimum-staffing/${contractId}/staff`, { method: 'POST', body: { employeeIds } }),
  release: (allocationId) => apiRequest(`/api/manager/minimum-staffing/release/${allocationId}`, { method: 'POST' }),
}

export const managerSubmissionsApi = {
  /** Payments your organizations say they made. status: 'Pending' | 'Verified' | 'Approved' | 'Rejected' | 'Withdrawn' (empty = all) */
  list: (status, signal) => apiRequest('/api/manager/billing/submissions', { params: { status }, signal }),
  pendingCount: (signal) => apiRequest('/api/manager/billing/submissions/pending-count', { signal }),
  /** You checked it; the admin approves next. */
  verify: (submissionId) => apiRequest(`/api/manager/billing/submissions/${submissionId}/verify`, { method: 'POST' }),
  reject: (submissionId, reason) => apiRequest(`/api/manager/billing/submissions/${submissionId}/reject`, { method: 'POST', body: { reason } }),
}

export const managerReceivablesApi = {
  /** What your organizations still owe, by how late: the same shape as the admin's report. */
  get: (params, signal) => apiRequest('/api/manager/billing/receivables', { params, signal }),
}

export const managerBillingApi = {
  /** Emails the organization a reminder about an invoice that is not paid yet. */
  reminder: (invoiceId) => apiRequest(`/api/manager/billing/invoices/${invoiceId}/reminder`, { method: 'POST' }),
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
  /** body: { organizationId, category ('Query' | 'Complaint'), subject, description, priority, sendToAdmin, note } */
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
