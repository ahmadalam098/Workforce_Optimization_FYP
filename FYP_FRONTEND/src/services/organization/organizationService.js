import { apiRequest } from '../apiClient.js'

// Endpoints from FYP_BACKEND/fyp_project/Controllers/Organization. An organization registers and signs in on its own,
// apart from the staff accounts (Admin, Manager, Employee, Business Owner).

/** body: { name, email, phone, country, address, password, confirmPassword } -> { message, organizationId } (the organization is Pending until the admin approves it) */
export function register(body) {
  return apiRequest('/api/organization/auth/register', { method: 'POST', body, auth: false })
}

/** Returns { message, user: { userId: null, organizationId, fullName (the organization name), email, roleName: 'Organization', status } } and sets the auth cookie. */
export function login({ email, password }) {
  return apiRequest('/api/organization/auth/login', { method: 'POST', body: { email, password }, auth: false })
}

/** Sends a 6-digit OTP to the organization's email (valid for 5 minutes, kept in Redis). */
export function sendOtp(email) {
  return apiRequest('/api/organization/auth/send-otp', { method: 'POST', body: { email }, auth: false })
}

/** Verifies the OTP; the backend then allows a password reset for 10 minutes. */
export function verifyOtp(email, otp) {
  return apiRequest('/api/organization/auth/verify-otp', { method: 'POST', body: { email, otp }, auth: false })
}

export function resetPassword({ email, newPassword, confirmPassword }) {
  return apiRequest('/api/organization/auth/reset-password', { method: 'POST', body: { email, newPassword, confirmPassword }, auth: false })
}

export const organizationApi = {
  /** The signed-in organization: { organizationId, name, email, phone, country, address, status, registeredAt, approvedAt } */
  overview: (signal) => apiRequest('/api/organization/overview', { signal }),
}

export const organizationChatApi = {
  /** The managers linked to this organization: [{ managerUserId, name, unread, lastMessage: { messageId, senderType, body, createdAt, readAt } | null }] */
  conversations: (signal) => apiRequest('/api/organization/chat/conversations', { signal }),
  /** Oldest first. `before` (a message id) loads the older page. */
  messages: (managerUserId, before, signal) => apiRequest(`/api/organization/chat/conversations/${managerUserId}/messages`, { params: { before, limit: 30 }, signal }),
}

export const organizationTeamApi = {
  /** The employees working for this organization now: [{ employeeId, userId, hasPicture, fullName, since, until, isMinimum, skills }] */
  team: (signal) => apiRequest('/api/organization/team', { signal }),
}

export const organizationSettingsApi = {
  /** { organizationId, name, email, status, phone, country, address, registeredAt, approvedAt } */
  profile: (signal) => apiRequest('/api/organization/settings/profile', { signal }),
  /** body: { phone, country, address } - the name, email and status are fixed (only the admin changes them) */
  updateProfile: (body) => apiRequest('/api/organization/settings/profile', { method: 'PUT', body }),
  /** body: { currentPassword, newPassword } */
  changePassword: (body) => apiRequest('/api/organization/settings/password', { method: 'POST', body }),
  /** { signedInAt, previousSignInAt } */
  security: (signal) => apiRequest('/api/organization/settings/security', { signal }),
  /** { inApp, contracts, requests, employees, invoices, chat, expiry, expiryDays (null = system value), systemExpiryDays, systemInAppEnabled } */
  notifications: (signal) => apiRequest('/api/organization/settings/notifications', { signal }),
  saveNotifications: (body) => apiRequest('/api/organization/settings/notifications', { method: 'PUT', body }),
}

export const organizationNotificationsApi = {
  /** { enabled, unreadCount, alerts: [{ title, message, link, key }], items: [{ id, action, title, message, actorName, entityType, entityId, createdAt, isUnread }] } */
  feed: (limit, signal) => apiRequest('/api/organization/notifications', { params: { limit }, signal }),
  readAll: () => apiRequest('/api/organization/notifications/read-all', { method: 'POST' }),
}

export const organizationBillingApi = {
  /** { currencies: [{ currency, invoiced, paid, outstanding, overdueInvoices }], invoiceCount } */
  summary: (signal) => apiRequest('/api/organization/billing/summary', { signal }),
  /** params: { search, status ('Issued' | 'PartiallyPaid' | 'Overdue' | 'Paid' | 'Cancelled'), page, pageSize } -> { items, total, page, pageSize }. Drafts are never listed. */
  invoices: (params, signal) => apiRequest('/api/organization/billing/invoices', { params, signal }),
  invoice: (invoiceId, signal) => apiRequest(`/api/organization/billing/invoices/${invoiceId}`, { signal }),
}

export const organizationReportsApi = {
  /** { from, to } (yyyy-mm-dd) -> { staffing, daily: [{ date, hours }], employees: [{ employeeId, name, hours, days, myRating }], requests, reviews } */
  usage: (params, signal) => apiRequest('/api/organization/reports/usage', { params, signal }),
  /** { from, to } -> { totalInvoiced, totalPaid, outstanding, overdue, months: [{ year, month, invoiced, paid }] } (each a list of { currency, amount }) */
  financial: (params, signal) => apiRequest('/api/organization/reports/financial', { params, signal }),
}

export const organizationEmployeesApi = {
  /** params: { search, status ('working' | 'former' | 'toReview') } -> [{ employeeId, userId, hasPicture, fullName, homeOrgName, rating, reviewCount, workingNow, canReview, myRating, myReviewDate }] */
  list: (params, signal) => apiRequest('/api/organization/employees', { params, signal }),
  /** One employee who worked for this organization: information, the reviews of ALL organizations ({ mine }), the periods of work and canReview. No private data. */
  get: (employeeId, signal) => apiRequest(`/api/organization/employees/${employeeId}`, { signal }),
  /** body: { rating (1-5), comment, allocationId? } - goes to the organization manager */
  review: (employeeId, body) => apiRequest(`/api/organization/employees/${employeeId}/reviews`, { method: 'POST', body }),
}

export const organizationRequestsApi = {
  /** The active skills for the optional skill of a request: [{ skillId, name }] */
  skills: (signal) => apiRequest('/api/organization/requests/skills', { signal }),
  /** status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled' | 'Unstaffed' (empty = all) -> [{ requestId, requiredEmployees, staffedNow, skillName, priority, startDatetime, endDatetime, reason, status, createdAt }] */
  list: (status, signal) => apiRequest('/api/organization/requests', { params: { status }, signal }),
  /** One request: the numbers, who works on it now ({ name, since, until }), the manager's decisions, canCancel */
  get: (requestId, signal) => apiRequest(`/api/organization/requests/${requestId}`, { signal }),
  /** body: { requiredEmployees, skillId?, priority, startDatetime, endDatetime, reason } - goes to the organization manager, not the admin */
  create: (body) => apiRequest('/api/organization/requests', { method: 'POST', body }),
  cancel: (requestId) => apiRequest(`/api/organization/requests/${requestId}/cancel`, { method: 'POST' }),
}

export const organizationContractsApi = {
  /** { canCreate, organizationStatus, items: [{ contractId, contractNumber, status, createdAt, approvedAt, minEmployees, maxEmployees, billingCycle, startDate, endDate }] } */
  list: (signal) => apiRequest('/api/organization/contracts', { signal }),
  /** One of its contracts: { contractId, contractNumber, status, createdAt, approvedAt, versionNo, canEdit, terms, decisions: [{ decision, reason, decidedAt }], dailyStaffing | null } */
  get: (contractId, signal) => apiRequest(`/api/organization/contracts/${contractId}`, { signal }),
  /** body: { startDate, endDate, startTime, endTime, minEmployees, maxEmployees, borrowingAllowed, maxBorrowedEmployees, billingCurrency, billingCycle, note } -> { message, contractId } */
  create: (body) => apiRequest('/api/organization/contracts', { method: 'POST', body }),
  /**
   * Ask to change an APPROVED contract (the current one keeps running until the admin decides). The hourly rates are not part of it.
   * body: { endDate, startTime, endTime, minEmployees, maxEmployees, borrowingAllowed, maxBorrowedEmployees, billingCycle, effectiveDate, comment }
   */
  requestChange: (contractId, body) => apiRequest(`/api/organization/contracts/${contractId}/changes`, { method: 'POST', body }),
  withdrawChange: (modificationId) => apiRequest(`/api/organization/contracts/changes/${modificationId}/withdraw`, { method: 'POST' }),
  /** Only while the contract is Pending. The prices and the priority stay as they are. */
  update: (contractId, body) => apiRequest(`/api/organization/contracts/${contractId}`, { method: 'PUT', body }),
}
