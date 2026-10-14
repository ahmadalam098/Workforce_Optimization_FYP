/** Centre-crops an image file to a square and shrinks it to `size` px. Resolves with a JPEG Blob. */
export function squareJpeg(file, size = 256, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      const side = Math.min(image.naturalWidth, image.naturalHeight)
      if (!side) {
        reject(new Error('This file is not a picture.'))
        return
      }
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const context = canvas.getContext('2d')
      // White behind transparent PNGs, otherwise they turn black in a JPEG.
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, size, size)
      context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, size, size)
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not prepare the picture.'))), 'image/jpeg', quality)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Use a JPG, PNG or WebP picture.'))
    }
    image.src = url
  })
}
