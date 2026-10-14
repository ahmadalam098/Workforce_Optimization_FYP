// Must match AdminWorkforceRequestsController in the backend.
export const REQUEST_STATUS_OPTIONS = [
  { value: 'Pending', label: 'Waiting for a decision' },
  { value: 'Approved', label: 'Approved' },
  { value: 'Unstaffed', label: 'Approved, still short' },
  { value: 'Rejected', label: 'Rejected' },
  { value: 'Cancelled', label: 'Cancelled' },
]
