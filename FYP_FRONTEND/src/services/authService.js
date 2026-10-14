import { apiRequest } from './apiClient.js'

// Endpoints from FYP_BACKEND/fyp_project/Controllers
// (UserLoginController, ForgetPasswordController, Admin/AuthController).

/** Returns { message, user: { userId, fullName, email, roleName } } and sets the auth cookie. */
export function login({ email, password, roleName }) {
  return apiRequest('/api/UserLogin/loginUser', {
    method: 'POST',
    body: { email, password, roleName },
    auth: false,
  })
}

/** Returns { user } for the current session, or throws 401 when the cookie is missing/expired. */
export function getCurrentUser() {
  return apiRequest('/api/Auth/me', { auth: false })
}

/** Clears the auth cookie on the server. */
export function logout() {
  return apiRequest('/api/Auth/logout', { method: 'POST', auth: false })
}

/** Sends a 6-digit OTP to the email (valid for 5 minutes). */
export function sendOtp(email) {
  return apiRequest('/api/ForgetPassword/send-otp', {
    method: 'POST',
    body: { email },
    auth: false,
  })
}

/** Verifies the OTP; the backend then allows a password reset for 10 minutes. */
export function verifyOtp(email, otp) {
  return apiRequest('/api/ForgetPassword/verify-otp', {
    method: 'POST',
    body: { email, otp },
    auth: false,
  })
}

export function resetPassword({ email, newPassword, confirmPassword }) {
  return apiRequest('/api/ForgetPassword/reset-password', {
    method: 'POST',
    body: { email, newPassword, confirmPassword },
    auth: false,
  })
}
