import { useRef, useState } from 'react'
import Alert from './ui/Alert.jsx'
import Avatar from './ui/Avatar.jsx'
import Button from './ui/Button.jsx'
import { removePicture, uploadPicture } from '../services/profileService.js'
import { squareJpeg } from '../utils/image.js'

const MAX_FILE_BYTES = 10 * 1024 * 1024

/**
 * Shows a person's picture with Change / Remove buttons. Works for any role.
 * `onChanged(version)` runs after a save (version is null after a removal) so the page can refresh other copies.
 */
function ProfilePhotoEditor({ userId, name, version, onChanged }) {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [localVersion, setLocalVersion] = useState(version)

  async function handleFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > MAX_FILE_BYTES) {
      setError('That picture is too big. Choose one under 10 MB.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const blob = await squareJpeg(file)
      const result = await uploadPicture(userId, blob)
      const next = result?.version ?? Date.now()
      setLocalVersion(next)
      onChanged?.(next)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove() {
    setBusy(true)
    setError('')
    try {
      await removePicture(userId)
      const next = Date.now()
      setLocalVersion(next)
      onChanged?.(next)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="photo-editor">
      <Avatar userId={userId} name={name} version={localVersion} size="xl" />
      <div className="photo-editor__actions">
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={handleFile} />
        <Button variant="secondary" loading={busy} onClick={() => inputRef.current?.click()}>
          Change picture
        </Button>
        <Button variant="secondary" disabled={busy} onClick={handleRemove}>
          Remove
        </Button>
        <p className="photo-editor__hint">JPG, PNG or WebP. It is cropped to a square.</p>
        {error && <Alert type="error">{error}</Alert>}
      </div>
    </div>
  )
}

export default ProfilePhotoEditor
