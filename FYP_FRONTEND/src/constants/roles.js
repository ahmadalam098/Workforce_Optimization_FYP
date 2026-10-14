// Role names must match Role.role_type values in the database.
export const ROLES = {
  ADMIN: 'Admin',
  BUSINESS_OWNER: 'Business Owner',
  ORGANIZATION_MANAGER: 'Organization Manager',
  EMPLOYEE: 'Employee',
}

// Roles shown in the login dropdown. Only enabled roles can sign in for now,
// because the backend login endpoint currently accepts Admin accounts only.
export const LOGIN_ROLE_OPTIONS = [
  { value: ROLES.ADMIN, label: 'Admin', description: 'System administration', enabled: true },
  { value: ROLES.BUSINESS_OWNER, label: 'Business Owner', description: 'Business performance', enabled: false },
  { value: ROLES.ORGANIZATION_MANAGER, label: 'Organization Manager', description: 'Manage organizations', enabled: false },
  { value: ROLES.EMPLOYEE, label: 'Employee', description: 'Shifts and assignments', enabled: false },
]

// Home page for each role after login.
export const ROLE_HOME = {
  [ROLES.ADMIN]: '/admin/dashboard',
}

export function getRoleHome(roleName) {
  const match = Object.keys(ROLE_HOME).find(
    (role) => role.toLowerCase() === String(roleName || '').toLowerCase(),
  )
  return match ? ROLE_HOME[match] : '/login'
}
