function escapeCell(value) {
  if (value === null || value === undefined) return ''
  const text = String(value)
  // Quote anything with a comma, quote or line break; double the quotes inside.
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Downloads rows as a .csv file (opens in Excel). `headers` and every row are arrays of the same length. */
export function downloadCsv(filename, headers, rows) {
  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(','))
  // The BOM makes Excel read UTF-8 correctly.
  const blob = new Blob([String.fromCharCode(0xfeff), lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
