import { apiRequest } from '../apiClient.js'

// Endpoints from FYP_BACKEND/fyp_project/Controllers/Employee (Employee role only).

export const employeeApi = {
  /**
   * The signed-in employee: { hasEmployeeRecord, fullName, email, phone, employeeId, joiningDate, availabilityStatus,
   * homeOrganization, workingOrganization, skills: [{ name, proficiency }], shift: { name, start, end } | null }
   */
  overview: (signal) => apiRequest('/api/employee/overview', { signal }),
}

export const employeeTicketsApi = {
  /** status: '' (all) | 'Open' | 'Resolved' -> [{ ticketId, ticketNumber, subject, category, priority, status, stage, organization, createdAt, resolvedAt }] */
  list: (status, signal) => apiRequest('/api/employee/tickets', { params: { status: status || undefined }, signal }),
  /** The same plus { description, answers: [{ messageType, body, createdAt, author }] } */
  get: (ticketId, signal) => apiRequest(`/api/employee/tickets/${ticketId}`, { signal }),
  /** body: { category ('Query' | 'Complaint'), subject, description, priority ('Low' | 'Medium' | 'High') } */
  create: (body) => apiRequest('/api/employee/tickets', { method: 'POST', body }),
}

export const employeeShiftsApi = {
  /**
   * { hasEmployeeRecord, workingOrganization, shifts: [{ assignmentId, shiftName, startTime, endTime, startDate, endDate (null = ongoing),
   * assignedBy, notes }] } - newest first; the page works out today, the week and the filters
   */
  mine: (signal) => apiRequest('/api/employee/shifts', { signal }),
}

export const employeeSalaryApi = {
  /**
   * The salary report of one year: { hasEmployeeRecord, year, years, currentSalary: { monthlySalary, currency, since, notes } | null,
   * history: [{ monthlySalary, currency, from, to }], months: [{ month, status (Paid | Approved | Draft | NotProcessed | Upcoming | BeforeStart),
   * statusLabel, currency, baseSalary, overtimeHours, overtimeAmount, adjustment, adjustmentNote, totalAmount, expectedAmount, paidAt }],
   * summary: { paidMonths, pendingMonths, received: [{ currency, amount, months }], pending: [{ currency, amount, months }] } }
   */
  report: (year, signal) => apiRequest('/api/employee/salary', { params: { year: year || undefined }, signal }),
}

export const employeeHoursApi = {
  /**
   * Day by day between two dates (yyyy-MM-dd, at most 62 days): { hasEmployeeRecord, days: [{ date, shiftName, startTime, endTime,
   * scheduledHours, overtimeHours (approved), pendingOvertimeHours }] }. The page adds the days up into weeks and months.
   */
  days: (from, to, signal) => apiRequest('/api/employee/hours', { params: { from, to }, signal }),
}

export const employeeNotificationsApi = {
  /**
   * { enabled, unreadCount, alerts: [], items: [{ id, action, title, message, actorName, entityType, entityId, createdAt, isUnread }],
   * shifts: [{ assignmentId, startDate, endDate, name, startTime, endTime }] } - the shifts around today, for the "your shift starts at" alert
   */
  feed: (limit, signal) => apiRequest('/api/employee/notifications', { params: { limit }, signal }),
  readAll: () => apiRequest('/api/employee/notifications/read-all', { method: 'POST' }),
}

export const employeeSettingsApi = {
  /** { userId, fullName, email, phone, roleName, employeeId, joiningDate, homeOrganization, workingOrganization, skills: [{ name, proficiency }] } */
  profile: (signal) => apiRequest('/api/employee/settings/profile', { signal }),
  /** body: { phone } - the only detail an employee changes themselves */
  updateProfile: (body) => apiRequest('/api/employee/settings/profile', { method: 'PUT', body }),
  /** body: { currentPassword, newPassword } */
  changePassword: (body) => apiRequest('/api/employee/settings/password', { method: 'POST', body }),
  /** { signedInAt, previousSignInAt } */
  security: (signal) => apiRequest('/api/employee/settings/security', { signal }),
  /** { inApp, systemInAppEnabled } */
  notifications: (signal) => apiRequest('/api/employee/settings/notifications', { signal }),
  /** body: { inApp } */
  saveNotifications: (body) => apiRequest('/api/employee/settings/notifications', { method: 'PUT', body }),
}

export const employeeOffersApi = {
  /** My offers, waiting ones first: [{ offerId, kind ('Request' | 'Minimum'), orgName, status, note, createdAt, respondedAt, requestReason, startsAt, endsAt, expiresAt }] */
  list: (signal) => apiRequest('/api/employee/offers', { signal }),
  /** Allocates me to the organization (the usual rules apply; if it cannot be done the offer fails and the message says why). */
  accept: (offerId) => apiRequest(`/api/employee/offers/${offerId}/accept`, { method: 'POST' }),
  decline: (offerId, note) => apiRequest(`/api/employee/offers/${offerId}/decline`, { method: 'POST', body: { note } }),
}
