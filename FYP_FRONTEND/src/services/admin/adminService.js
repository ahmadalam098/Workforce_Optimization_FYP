import { apiRequest } from '../apiClient.js'

// Admin portal endpoints (FYP_BACKEND/fyp_project/Controllers/Admin). All require the Admin role.

export const dashboardApi = {
  summary: (signal) => apiRequest('/api/admin/dashboard/summary', { signal }),
}

export const organizationsApi = {
  /** [{ organizationId, name, status, country }] for dropdowns */
  lookup: (signal) => apiRequest('/api/admin/organizations/lookup', { signal }),
  /** params: { search, status, page, pageSize } -> { items, total, page, pageSize } */
  list: (params, signal) => apiRequest('/api/admin/organizations', { params, signal }),
  get: (organizationId, signal) => apiRequest(`/api/admin/organizations/${organizationId}`, { signal }),
  create: (body) => apiRequest('/api/admin/organizations', { method: 'POST', body }),
  update: (organizationId, body) => apiRequest(`/api/admin/organizations/${organizationId}`, { method: 'PUT', body }),
  approve: (organizationId, reason) =>
    apiRequest(`/api/admin/organizations/${organizationId}/approve`, { method: 'POST', body: { reason } }),
  reject: (organizationId, reason) =>
    apiRequest(`/api/admin/organizations/${organizationId}/reject`, { method: 'POST', body: { reason } }),
  suspend: (organizationId, reason) =>
    apiRequest(`/api/admin/organizations/${organizationId}/suspend`, { method: 'POST', body: { reason } }),
  /** Only an organization with no working history can be deleted (409 with the reason otherwise). */
  remove: (organizationId) => apiRequest(`/api/admin/organizations/${organizationId}`, { method: 'DELETE' }),
}

export const contractsApi = {
  /** params: { search, status, organizationId, page, pageSize } -> { items, total, page, pageSize } */
  list: (params, signal) => apiRequest('/api/admin/contracts', { params, signal }),
  get: (contractId, signal) => apiRequest(`/api/admin/contracts/${contractId}`, { signal }),
  update: (contractId, body) => apiRequest(`/api/admin/contracts/${contractId}`, { method: 'PUT', body }),
  approve: (contractId, reason) => apiRequest(`/api/admin/contracts/${contractId}/approve`, { method: 'POST', body: { reason } }),
  reject: (contractId, reason) => apiRequest(`/api/admin/contracts/${contractId}/reject`, { method: 'POST', body: { reason } }),
  terminate: (contractId, reason) => apiRequest(`/api/admin/contracts/${contractId}/terminate`, { method: 'POST', body: { reason } }),
  addRule: (contractId, body) => apiRequest(`/api/admin/contracts/${contractId}/rules`, { method: 'POST', body }),
  updateRule: (contractId, ruleId, body) =>
    apiRequest(`/api/admin/contracts/${contractId}/rules/${ruleId}`, { method: 'PUT', body }),
  deleteRule: (contractId, ruleId) => apiRequest(`/api/admin/contracts/${contractId}/rules/${ruleId}`, { method: 'DELETE' }),
}

export const contractChangesApi = {
  /**
   * The changes organizations asked for in approved contracts. params: { contractId, status ('Pending' | 'Approved' | 'Rejected' | 'Withdrawn' | 'all', default Pending) } ->
   * [{ modificationId, contractId, contractNumber, organizationName, status, comment, adminResponse, effectiveDate, createdAt, reviewedAt, appliedAt, scheduled, changes: [{ key, current, proposed }] }]
   */
  list: (params, signal) => apiRequest('/api/admin/contract-changes', { params, signal }),
  /** Puts a new contract version in force (now, or on the day the organization asked for). */
  approve: (modificationId, note) => apiRequest(`/api/admin/contract-changes/${modificationId}/approve`, { method: 'POST', body: { note } }),
  /** The reason is required; the current contract keeps running. */
  reject: (modificationId, note) => apiRequest(`/api/admin/contract-changes/${modificationId}/reject`, { method: 'POST', body: { note } }),
}

export const dailyStaffingApi = {
  /**
   * Where the daily contracts stand today: [{ contractId, contractNumber, orgId, orgName, min, max, window, state (Complete | Short | Waiting | WindowEnded | NotStarted |
   * Finished | OrganizationInactive | NoWindow), appointed, atOrganizationNow, extra, stillShort, employees: [names], message }]. contractId is optional.
   */
  status: (contractId, signal) => apiRequest('/api/admin/daily-staffing', { params: { contractId: contractId || undefined }, signal }),
  /** Appoints the missing minimum employees of every daily contract now -> { message, day, released, contracts } */
  runAll: () => apiRequest('/api/admin/daily-staffing/run', { method: 'POST' }),
  runOne: (contractId) => apiRequest(`/api/admin/daily-staffing/run/${contractId}`, { method: 'POST' }),
}

export const skillsApi = {
  /** params: { search, category, active, page, pageSize } -> { items, total, page, pageSize } */
  list: (params, signal) => apiRequest('/api/admin/skills', { params, signal }),
  /** Active skills for dropdowns: [{ skillId, name, category }] */
  lookup: (signal) => apiRequest('/api/admin/skills/lookup', { signal }),
  categories: (signal) => apiRequest('/api/admin/skills/categories', { signal }),
  create: (body) => apiRequest('/api/admin/skills', { method: 'POST', body }),
  update: (skillId, body) => apiRequest(`/api/admin/skills/${skillId}`, { method: 'PUT', body }),
  setActive: (skillId, isActive) => apiRequest(`/api/admin/skills/${skillId}/active`, { method: 'PATCH', body: { isActive } }),
}

export const shiftsApi = {
  /** [{ shiftId, name, startTime, endTime, isOvernight, durationMinutes, assignedCount }] */
  list: (signal) => apiRequest('/api/admin/shifts', { signal }),
  get: (shiftId, signal) => apiRequest(`/api/admin/shifts/${shiftId}`, { signal }),
  create: (body) => apiRequest('/api/admin/shifts', { method: 'POST', body }),
  update: (shiftId, body) => apiRequest(`/api/admin/shifts/${shiftId}`, { method: 'PUT', body }),
  remove: (shiftId) => apiRequest(`/api/admin/shifts/${shiftId}`, { method: 'DELETE' }),
  assign: (shiftId, employeeIds) => apiRequest(`/api/admin/shifts/${shiftId}/assign`, { method: 'POST', body: { employeeIds } }),
  unassign: (shiftId, employeeIds) => apiRequest(`/api/admin/shifts/${shiftId}/unassign`, { method: 'POST', body: { employeeIds } }),
}

// Skills and shift of a single employee
export const employeeExtrasApi = {
  addSkill: (employeeId, body) => apiRequest(`/api/admin/employees/${employeeId}/skills`, { method: 'POST', body }),
  updateSkill: (employeeId, skillId, body) => apiRequest(`/api/admin/employees/${employeeId}/skills/${skillId}`, { method: 'PUT', body }),
  removeSkill: (employeeId, skillId) => apiRequest(`/api/admin/employees/${employeeId}/skills/${skillId}`, { method: 'DELETE' }),
  /** shiftId = null removes the employee from their shift */
  setShift: (employeeId, shiftId) => apiRequest(`/api/admin/employees/${employeeId}/shift`, { method: 'PUT', body: { shiftId } }),
}

export const allocationsApi = {
  /** params: { state: 'open' | 'closed' | 'all', search, organizationId, type, page, pageSize } */
  list: (params, signal) => apiRequest('/api/admin/allocations', { params, signal }),
  get: (allocationId, signal) => apiRequest(`/api/admin/allocations/${allocationId}`, { signal }),
  /** Active employees that have no open allocation: [{ employeeId, fullName, homeOrgName, availabilityStatus }] */
  eligibleEmployees: (search, signal) => apiRequest('/api/admin/allocations/eligible-employees', { params: { search }, signal }),
  /** body: { employeeId, assignOrgId, expectedEnd, reason, force } */
  allocate: (body) => apiRequest('/api/admin/allocations', { method: 'POST', body }),
  /** body: { assignOrgId, expectedEnd, reason, force } */
  reallocate: (allocationId, body) => apiRequest(`/api/admin/allocations/${allocationId}/reallocate`, { method: 'POST', body }),
  release: (allocationId, reason) => apiRequest(`/api/admin/allocations/${allocationId}/release`, { method: 'POST', body: { reason } }),
}

export const allocationHistoryApi = {
  /** params: { search, organizationId, action, source: 'ai' | 'manual', from, to, page, pageSize } */
  list: (params, signal) => apiRequest('/api/admin/allocation-history', { params, signal }),
  actionTypes: (signal) => apiRequest('/api/admin/allocation-history/action-types', { signal }),
}

export const availabilityApi = {
  /** params: { search, status, organizationId, shiftId, skillId, page, pageSize } -> { summary, items, total, page, pageSize, refreshedAt } */
  get: (params, signal) => apiRequest('/api/admin/availability', { params, signal }),
}

export const invoicesApi = {
  /** params: { search, status, organizationId, page, pageSize } */
  list: (params, signal) => apiRequest('/api/admin/invoices', { params, signal }),
  get: (invoiceId, signal) => apiRequest(`/api/admin/invoices/${invoiceId}`, { signal }),
  // The admin does not create invoices: the organization manager prepares them and sends them here.
  /** Verifies the invoice the manager sent and issues it to the organization. */
  verify: (invoiceId) => apiRequest(`/api/admin/invoices/${invoiceId}/verify`, { method: 'POST' }),
  /** Sends the draft back to the organization manager with a reason. */
  sendBack: (invoiceId, reason) => apiRequest(`/api/admin/invoices/${invoiceId}/return`, { method: 'POST', body: { reason } }),
  cancel: (invoiceId, reason) => apiRequest(`/api/admin/invoices/${invoiceId}/cancel`, { method: 'POST', body: { reason } }),
  /** body: { amount, paidAt, method, reference, notes, exchangeRate } */
  recordPayment: (invoiceId, body) => apiRequest(`/api/admin/invoices/${invoiceId}/payments`, { method: 'POST', body }),
}

export const financeApi = {
  summary: (signal) => apiRequest('/api/admin/finance/summary', { signal }),
  /** Payment status per organization and currency */
  organizations: (signal) => apiRequest('/api/admin/finance/organizations', { signal }),
}

export const paymentRulesApi = {
  list: (signal) => apiRequest('/api/admin/payment-rules', { signal }),
  create: (body) => apiRequest('/api/admin/payment-rules', { method: 'POST', body }),
  update: (ruleId, body) => apiRequest(`/api/admin/payment-rules/${ruleId}`, { method: 'PUT', body }),
  setActive: (ruleId, isActive) => apiRequest(`/api/admin/payment-rules/${ruleId}/active`, { method: 'PATCH', body: { isActive } }),
}

export const exchangeRatesApi = {
  list: (signal) => apiRequest('/api/admin/exchange-rates', { signal }),
  /** body: { fromCurrency, toCurrency, rate, effectiveDate } */
  create: (body) => apiRequest('/api/admin/exchange-rates', { method: 'POST', body }),
}

export const ticketsApi = {
  /** params: { search, status ('Open' | 'Resolved'), organizationId, page, pageSize } */
  list: (params, signal) => apiRequest('/api/admin/tickets', { params, signal }),
  summary: (signal) => apiRequest('/api/admin/tickets/summary', { signal }),
  /** Adds a query for an organization (for testing). body: { organizationId, subject, description, category, priority } */
  create: (body) => apiRequest('/api/admin/tickets', { method: 'POST', body }),
  get: (ticketId, signal) => apiRequest(`/api/admin/tickets/${ticketId}`, { signal }),
  /** Resolves a query; the comment is emailed to the organization and its managers. */
  resolve: (ticketId, comment) => apiRequest(`/api/admin/tickets/${ticketId}/resolve`, { method: 'POST', body: { comment } }),
}

export const auditApi = {
  /** params: { search, action, entityType, actorUserId, from, to, page, pageSize } */
  list: (params, signal) => apiRequest('/api/admin/audit-logs', { params, signal }),
  /** { actions: [], entityTypes: [], actors: [{ userId, name }] } for the filter dropdowns */
  facets: (signal) => apiRequest('/api/admin/audit-logs/facets', { signal }),
}

export const reportsApi = {
  /** All take { from, to } as yyyy-mm-dd (inclusive days). */
  utilization: (params, signal) => apiRequest('/api/admin/reports/utilization', { params, signal }),
  allocations: (params, signal) => apiRequest('/api/admin/reports/allocations', { params, signal }),
  financial: (params, signal) => apiRequest('/api/admin/reports/financial', { params, signal }),
  /** { asOf } -> { asOf, byOrganization: [{ orgId, orgName, currency, notDue, late1to30, late31to60, late61to90, over90, total, invoices }], totals, overdueInvoices } */
  receivables: (params, signal) => apiRequest('/api/admin/reports/receivables', { params, signal }),
}

export const paymentSubmissionsApi = {
  /** status: 'Open' (default: waiting for a decision) | 'Pending' | 'Verified' | 'Approved' | 'Rejected' | 'Withdrawn' | 'all' */
  list: (status, signal) => apiRequest('/api/admin/payment-submissions', { params: { status }, signal }),
  /** { count (open), toApprove (already verified by the manager) } */
  pendingCount: (signal) => apiRequest('/api/admin/payment-submissions/pending-count', { signal }),
  /** Records the payment on the invoice (the receipt exists then). body: { exchangeRate?, note? } -> { message, paymentId, receiptNumber } */
  approve: (submissionId, body) => apiRequest(`/api/admin/payment-submissions/${submissionId}/approve`, { method: 'POST', body }),
  reject: (submissionId, reason) => apiRequest(`/api/admin/payment-submissions/${submissionId}/reject`, { method: 'POST', body: { reason } }),
}

export const paymentsLedgerApi = {
  /** params: { search, organizationId, from, to, method, verified, page, pageSize } -> { items, total, page, pageSize, totals: [{ currency, amount, amountPkr, count }] } */
  list: (params, signal) => apiRequest('/api/admin/payments', { params, signal }),
  /** The same filters, every matching payment (up to 5000), for a CSV. */
  exportAll: (params) => apiRequest('/api/admin/payments/export', { params }),
}

/** Online payments through the payment gateway (Safepay): who paid what, and "check with the gateway" for one still waiting. */
export const onlinePaymentsApi = {
  /** params: { status, organizationId } -> { gateway, demo, received: [{ currency, amount, count }], items: [...] } */
  list: (params, signal) => apiRequest('/api/admin/online-payments', { params, signal }),
  /** -> { message, outcome } */
  check: (token) => apiRequest(`/api/admin/online-payments/${token}/check`, { method: 'POST' }),
}

export const billingMailApi = {
  invoice: (invoiceId) => apiRequest(`/api/admin/invoices/${invoiceId}/email`, { method: 'POST' }),
  reminder: (invoiceId) => apiRequest(`/api/admin/invoices/${invoiceId}/reminder`, { method: 'POST' }),
  receipt: (paymentId) => apiRequest(`/api/admin/payments/${paymentId}/email`, { method: 'POST' }),
  statement: (params) => apiRequest('/api/admin/statements/email', { method: 'POST', params }),
}

export const employeesApi = {
  /** params: { search, status, organizationId, active, page, pageSize } -> { items, total, page, pageSize } */
  list: (params, signal) => apiRequest('/api/admin/employees', { params, signal }),
  /** Active employees for a dropdown: [{ employeeId, fullName, orgName }] (orgName = where they work now) */
  lookup: (signal) => apiRequest('/api/admin/employees/lookup', { signal }),
  get: (employeeId, signal) => apiRequest(`/api/admin/employees/${employeeId}`, { signal }),
  create: (body) => apiRequest('/api/admin/employees', { method: 'POST', body }),
  update: (employeeId, body) => apiRequest(`/api/admin/employees/${employeeId}`, { method: 'PUT', body }),
  setActive: (employeeId, isActive, reason) =>
    apiRequest(`/api/admin/employees/${employeeId}/active`, { method: 'PATCH', body: { isActive, reason } }),
  resetPassword: (employeeId, newPassword) =>
    apiRequest(`/api/admin/employees/${employeeId}/reset-password`, { method: 'POST', body: { newPassword } }),
  statuses: (signal) => apiRequest('/api/admin/employees/statuses', { signal }),
}

export const usersApi = {
  /** params: { roleType, search, active, page, pageSize } -> { items, total, page, pageSize } */
  list: (params, signal) => apiRequest('/api/admin/users', { params, signal }),
  create: (body) => apiRequest('/api/admin/users', { method: 'POST', body }),
  update: (userId, body) => apiRequest(`/api/admin/users/${userId}`, { method: 'PUT', body }),
  /** Permanent delete of a deactivated Business Owner (409 with the reason otherwise). */
  remove: (userId) => apiRequest(`/api/admin/users/${userId}`, { method: 'DELETE' }),
  setActive: (userId, isActive, reason) =>
    apiRequest(`/api/admin/users/${userId}/active`, { method: 'PATCH', body: { isActive, reason } }),
  resetPassword: (userId, newPassword) =>
    apiRequest(`/api/admin/users/${userId}/reset-password`, { method: 'POST', body: { newPassword } }),
}

export const managersApi = {
  list: (params, signal) => apiRequest('/api/admin/managers', { params, signal }),
  create: (body) => apiRequest('/api/admin/managers', { method: 'POST', body }),
  setOrganizations: (userId, organizationIds) =>
    apiRequest(`/api/admin/managers/${userId}/organizations`, { method: 'PUT', body: { organizationIds } }),
}

export const workforceRequestsApi = {
  /** params: { search, status ('Pending' | 'Approved' | 'Rejected' | 'Cancelled' | 'Unstaffed'), priority, orgId, page, pageSize } */
  list: (params, signal) => apiRequest('/api/admin/workforce-requests', { params, signal }),
  summary: (signal) => apiRequest('/api/admin/workforce-requests/summary', { signal }),
  get: (requestId, signal) => apiRequest(`/api/admin/workforce-requests/${requestId}`, { signal }),
  /** body: { organizationId, requiredEmployees, skillId, priority, startDatetime, endDatetime, reason } -> { message, requestId, warnings } */
  create: (body) => apiRequest('/api/admin/workforce-requests', { method: 'POST', body }),
  approve: (requestId, note) => apiRequest(`/api/admin/workforce-requests/${requestId}/approve`, { method: 'POST', body: { note } }),
  reject: (requestId, note) => apiRequest(`/api/admin/workforce-requests/${requestId}/reject`, { method: 'POST', body: { note } }),
  cancel: (requestId, note) => apiRequest(`/api/admin/workforce-requests/${requestId}/cancel`, { method: 'POST', body: { note } }),
}

export const reviewEscalationsApi = {
  /** status: 'Pending' (default) | 'Decided' | 'all' -> [{ escalationId, reviewId, employeeId, employeeName, employeeActive, organizationName, rating, comment, managerNote, status, adminAction, adminResponse, createdAt, decidedAt }] */
  list: (status, signal) => apiRequest('/api/admin/review-escalations', { params: { status }, signal }),
  pendingCount: (signal) => apiRequest('/api/admin/review-escalations/pending-count', { signal }),
  /** One request with the employee's other reviews and warnings. */
  get: (escalationId, signal) => apiRequest(`/api/admin/review-escalations/${escalationId}`, { signal }),
  /** body: { action ('Deactivate' | 'Warn' | 'Dismiss'), response (required) } - Deactivate releases the employee from every organization; they cannot sign in until activated. */
  decide: (escalationId, body) => apiRequest(`/api/admin/review-escalations/${escalationId}/decide`, { method: 'POST', body }),
}

export const settingsApi = {
  /** [{ key, section, group, label, description, kind (int|bool|text|choice), unit, value (text), default, min, max, options: [{ value, label }], isDefault, updatedAt, updatedBy }] */
  list: (signal) => apiRequest('/api/admin/settings', { signal }),
  /** value is text (numbers as digits, switches as 'true'/'false'); null puts the setting back to its default */
  save: (key, value) => apiRequest(`/api/admin/settings/${key}`, { method: 'PUT', body: { value } }),
}

export const myProfileApi = {
  /** body: { fullName, email } -> { message, user } */
  update: (body) => apiRequest('/api/admin/profile', { method: 'PUT', body }),
  /** body: { currentPassword, newPassword } */
  changePassword: (body) => apiRequest('/api/admin/profile/password', { method: 'POST', body }),
}

export const systemApi = {
  /** [{ roleId, name, description, totalUsers, activeUsers }] */
  roles: (signal) => apiRequest('/api/admin/system/roles', { signal }),
}

export const notificationsApi = {
  /** { unreadCount, items: [{ id, action, title, message, actorName, entityType, entityId, createdAt, isUnread }] } */
  feed: (limit, signal) => apiRequest('/api/admin/notifications', { params: { limit }, signal }),
  readAll: () => apiRequest('/api/admin/notifications/read-all', { method: 'POST' }),
}

/** The company's expenses (PKR). The admin writes down an amount and, if wanted, what it was for. */
export const expensesApi = {
  /** params: { from, to, includeVoided, page, pageSize } -> { items: [{ expenseId, expenseDate, amountPkr, description, createdBy, voided, voidReason, canVoid }], total, page, pageSize, totalPkr, balance } */
  list: (params, signal) => apiRequest('/api/admin/expenses', { params, signal }),
  /** body: { amount, expenseDate?, description? } */
  add: (body) => apiRequest('/api/admin/expenses', { method: 'POST', body }),
  /** Only while the expense has not been counted in a payment to the owners. */
  void: (expenseId, reason) => apiRequest(`/api/admin/expenses/${expenseId}/void`, { method: 'POST', body: { reason } }),
}

/** The balance sheet and "send the profit to the business owners". */
export const balanceSheetApi = {
  /** year?, month? -> { month: { label, totalPkr, payments, byOrganization: [{ orgId, orgName, payments, amountPkr }] }, balance, preview: { canSend, reason, available, owners: [{ userId, name, sharePkr }] }, sheet: { year, years, months, totals, closingPkr }, settlements: [...] } */
  get: (year, month, signal) => apiRequest('/api/admin/balance-sheet', { params: { year, month }, signal }),
  transactions: (page, signal) => apiRequest('/api/admin/balance-sheet/transactions', { params: { page, pageSize: 15 }, signal }),
  /** Shares everything that is left equally between the active business owners. body: { note? } */
  send: (body) => apiRequest('/api/admin/balance-sheet/send', { method: 'POST', body }),
}
