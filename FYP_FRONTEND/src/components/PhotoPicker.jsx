import { useEffect, useRef, useState } from 'react'
import Button from './ui/Button.jsx'
import { getInitials } from '../utils/format.js'

const MAX_FILE_BYTES = 10 * 1024 * 1024

/**
 * Choose a picture while creating a person. Nothing is sent yet: the form uploads it after the account exists.
 * `file` is the chosen File (or null); `onChange(file)` receives the new choice.
 */
function PhotoPicker({ file, name, onChange }) {
  const inputRef = useRef(null)
  const [preview, setPreview] = useState('')
  const [error, setError] = useState('')

  // The preview address is made when a picture is chosen and released when it is replaced or removed.
  const previewRef = useRef('')
  useEffect(() => () => previewRef.current && URL.revokeObjectURL(previewRef.current), [])

  function setPicture(next) {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    previewRef.current = next ? URL.createObjectURL(next) : ''
    setPreview(previewRef.current)
    onChange(next)
  }

  function handleFile(event) {
    const chosen = event.target.files?.[0]
    event.target.value = ''
    if (!chosen) return
    if (!/^image\/(jpeg|png|webp)$/.test(chosen.type)) {
      setError('Use a JPG, PNG or WebP picture.')
      return
    }
    if (chosen.size > MAX_FILE_BYTES) {
      setError('That picture is too big. Choose one under 10 MB.')
      return
    }
    setError('')
    setPicture(chosen)
  }

  return (
    <div className="photo-editor">
      <span className="avatar-pic avatar-pic--xl" aria-hidden="true">
        {preview ? <img src={preview} alt="" /> : getInitials(name)}
      </span>
      <div className="photo-editor__actions">
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={handleFile} />
        <Button variant="secondary" onClick={() => inputRef.current?.click()}>
          {file ? 'Choose another' : 'Add picture (optional)'}
        </Button>
        {file && (
          <Button variant="secondary" onClick={() => setPicture(null)}>
            Remove
          </Button>
        )}
        <p className="photo-editor__hint">{error || 'JPG, PNG or WebP. It is cropped to a square and saved with the account.'}</p>
      </div>
    </div>
  )
}

export default PhotoPicker
