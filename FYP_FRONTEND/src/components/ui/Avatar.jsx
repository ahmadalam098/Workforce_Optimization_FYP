import { useState } from 'react'
import { pictureUrl } from '../../services/profileService.js'
import { getInitials } from '../../utils/format.js'
import './Avatar.css'

/**
 * A person's picture, or their initials when they have none.
 * `hasPicture` false (from the list data) skips the request completely. size: sm | md | lg | xl. `version` changes after the picture is replaced so the new one is loaded.
 */
function Avatar({ userId, name, version, hasPicture = true, size = 'md', className = '' }) {
  const [failedUrl, setFailedUrl] = useState('')
  const url = userId != null && hasPicture ? pictureUrl(userId, version) : ''
  const showImage = Boolean(url) && failedUrl !== url

  return (
    <span className={`avatar-pic avatar-pic--${size} ${className}`} aria-hidden="true">
      {showImage ? <img src={url} alt="" onError={() => setFailedUrl(url)} /> : getInitials(name)}
    </span>
  )
}

export default Avatar
