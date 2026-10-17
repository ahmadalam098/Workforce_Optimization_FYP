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
  /** body: { orgId, periodStart, periodEnd } -> lines worked out from contract rates and allocated hours (nothing saved) */
  preview: (body) => apiRequest('/api/admin/invoices/preview', { method: 'POST', body }),
  create: (body) => apiRequest('/api/admin/invoices', { method: 'POST', body }),
  recalculate: (invoiceId) => apiRequest(`/api/admin/invoices/${invoiceId}/recalculate`, { method: 'POST' }),
  addLine: (invoiceId, body) => apiRequest(`/api/admin/invoices/${invoiceId}/lines`, { method: 'POST', body }),
  deleteLine: (invoiceId, lineId) => apiRequest(`/api/admin/invoices/${invoiceId}/lines/${lineId}`, { method: 'DELETE' }),
  issue: (invoiceId) => apiRequest(`/api/admin/invoices/${invoiceId}/issue`, { method: 'POST' }),
  cancel: (invoiceId, reason) => apiRequest(`/api/admin/invoices/${invoiceId}/cancel`, { method: 'POST', body: { reason } }),
  /** body: { amount, paidAt, method, reference, notes, exchangeRate } */
  recordPayment: (invoiceId, body) => apiRequest(`/api/admin/invoices/${invoiceId}/payments`, { method: 'POST', body }),
}

export const financeApi = {
  summary: (signal) => apiRequest('/api/admin/finance/summary', { signal }),
  /** Payment status per organization and currency */
  organizations: (signal) => apiRequest('/api/admin/finance/organizations', { signal }),
}

export const salariesApi = {
  /** params: { search, organizationId, hasSalary, year, page, pageSize } - every item also has paidMonths and pendingMonths of that year */
  list: (params, signal) => apiRequest('/api/admin/salaries', { params, signal }),
  /** Month by month for one employee: { year, years, currentSalary, history, months: [{ month, status, statusLabel, ... }], summary } */
  months: (employeeId, year, signal) => apiRequest(`/api/admin/salaries/${employeeId}/months`, { params: { year: year || undefined }, signal }),
  history: (employeeId, signal) => apiRequest(`/api/admin/salaries/${employeeId}/history`, { signal }),
  /** body: { monthlySalary, currency, effectiveFrom, notes } */
  set: (employeeId, body) => apiRequest(`/api/admin/salaries/${employeeId}`, { method: 'POST', body }),
}

export const payrollApi = {
  list: (params, signal) => apiRequest('/api/admin/payroll', { params, signal }),
  get: (payrollId, signal) => apiRequest(`/api/admin/payroll/${payrollId}`, { signal }),
  create: (body) => apiRequest('/api/admin/payroll', { method: 'POST', body }),
  updateItem: (payrollId, itemId, body) => apiRequest(`/api/admin/payroll/${payrollId}/items/${itemId}`, { method: 'PUT', body }),
  refreshOvertime: (payrollId) => apiRequest(`/api/admin/payroll/${payrollId}/refresh-overtime`, { method: 'POST' }),
  approve: (payrollId) => apiRequest(`/api/admin/payroll/${payrollId}/approve`, { method: 'POST' }),
  markPaid: (payrollId) => apiRequest(`/api/admin/payroll/${payrollId}/pay`, { method: 'POST' }),
  remove: (payrollId) => apiRequest(`/api/admin/payroll/${payrollId}`, { method: 'DELETE' }),
}

export const overtimeApi = {
  /** params: { status, year, month, search, page, pageSize } */
  list: (params, signal) => apiRequest('/api/admin/overtime', { params, signal }),
  create: (body) => apiRequest('/api/admin/overtime', { method: 'POST', body }),
  approve: (overtimeId) => apiRequest(`/api/admin/overtime/${overtimeId}/approve`, { method: 'POST' }),
  reject: (overtimeId) => apiRequest(`/api/admin/overtime/${overtimeId}/reject`, { method: 'POST' }),
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
