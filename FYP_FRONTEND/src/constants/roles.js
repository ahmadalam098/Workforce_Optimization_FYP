// Role names must match Role.role_type values in the database.
export const ROLES = {
  ADMIN: 'Admin',
  BUSINESS_OWNER: 'Business Owner',
  ORGANIZATION_MANAGER: 'Organization Manager',
  EMPLOYEE: 'Employee',
  // An organization registers and signs in on its own (/organization/login); it is not a staff role.
  ORGANIZATION: 'Organization',
}

// Roles shown in the login dropdown. Only roles that have a portal can sign in (Admin, Business Owner, Organization Manager and Employee).
export const LOGIN_ROLE_OPTIONS = [
  { value: ROLES.ADMIN, label: 'Admin', description: 'System administration', enabled: true },
  { value: ROLES.BUSINESS_OWNER, label: 'Business Owner', description: 'Business performance', enabled: true },
  { value: ROLES.ORGANIZATION_MANAGER, label: 'Organization Manager', description: 'Manage organizations', enabled: true },
  { value: ROLES.EMPLOYEE, label: 'Employee', description: 'Shifts and assignments', enabled: true },
]

// Home page for each role after login.
export const ROLE_HOME = {
  [ROLES.ADMIN]: '/admin/dashboard',
  [ROLES.ORGANIZATION_MANAGER]: '/manager/dashboard',
  [ROLES.EMPLOYEE]: '/employee/dashboard',
  [ROLES.BUSINESS_OWNER]: '/owner/dashboard',
  [ROLES.ORGANIZATION]: '/organization/dashboard',
}

export function getRoleHome(roleName) {
  const match = Object.keys(ROLE_HOME).find(
    (role) => role.toLowerCase() === String(roleName || '').toLowerCase(),
  )
  return match ? ROLE_HOME[match] : '/login'
}
