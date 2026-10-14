import { API_BASE_URL } from '../config/env.js'
import { apiRequest } from './apiClient.js'

// Endpoints from FYP_BACKEND/fyp_project/Controllers/ProfilePictureController.cs (any signed-in role).

/** URL of a user's picture. It answers 404 when the user has none. `version` forces a reload after a change. */
export function pictureUrl(userId, version) {
  return `${API_BASE_URL}/api/profile/picture/${userId}${version ? `?v=${version}` : ''}`
}

/** `blob` is the (already resized) image. Returns { message, version }. */
export function uploadPicture(userId, blob) {
  const form = new FormData()
  form.append('file', blob, 'picture.jpg')
  return apiRequest(`/api/profile/picture/${userId}`, { method: 'PUT', body: form })
}

export function removePicture(userId) {
  return apiRequest(`/api/profile/picture/${userId}`, { method: 'DELETE' })
}

/**
 * Saves the picture chosen in a create form. The account already exists at this point, so a problem here must not
 * make the form look like it failed. Returns an error message, or '' when all went well.
 */
export async function saveNewPersonPicture(userId, file, squareJpeg) {
  if (!file || userId == null) return ''
  try {
    await uploadPicture(userId, await squareJpeg(file))
    return ''
  } catch (error) {
    return error.message
  }
}
