// Used by the Queries and Staff Requests screens.
export const TICKET_PRIORITIES = ['Low', 'Medium', 'High', 'Critical']
export const TICKET_PRIORITY_OPTIONS = TICKET_PRIORITIES.map((value) => ({ value, label: value }))

export const QUERY_STATUS_OPTIONS = [
  { value: 'Open', label: 'Open' },
  { value: 'Resolved', label: 'Resolved' },
]

export const QUERY_CATEGORY_OPTIONS = ['Query', 'Complaint', 'Payment', 'Technical', 'Allocation', 'Other'].map((value) => ({ value, label: value }))
