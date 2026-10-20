import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { formatCurrency } from '../../utils/format.js'

/** An amount with its currency, e.g. "USD 1,000.00". */
export function Money({ amount, currency }) {
  return <>{formatCurrency(amount, currency)}</>
}

/** The QR of a document: it opens the public page that says whether the document is genuine. */
export function Qr({ verify }) {
  const [image, setImage] = useState('')
  const link = verify ? `${window.location.origin}${verify.path}` : ''

  useEffect(() => {
    if (!link) return undefined
    let cancelled = false
    QRCode.toDataURL(link, { margin: 0, width: 220, color: { dark: '#0b1f3a', light: '#ffffff' } })
      .then((url) => {
        if (!cancelled) setImage(url)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [link])

  if (!verify) return null
  return (
    <div className="doc-qr">
      {image && <img src={image} alt="QR code to check this document" />}
      <span>
        Scan to check this document
        <br />
        Code <strong>{verify.code}</strong>
      </span>
    </div>
  )
}

/** The company letterhead and the document title with its number. */
export function Head({ letterhead, title, number, children }) {
  return (
    <header className="doc-head">
      <div>
        <h1 className="doc-head__company">{letterhead.companyName}</h1>
        {letterhead.address && <p className="doc-head__line">{letterhead.address}</p>}
        {(letterhead.phone || letterhead.email) && <p className="doc-head__line">{[letterhead.phone, letterhead.email].filter(Boolean).join(' · ')}</p>}
        {letterhead.registrationNumber && <p className="doc-head__line">Reg. no. {letterhead.registrationNumber}</p>}
      </div>
      <div className="doc-head__title">
        <h2>{title}</h2>
        {number && <p>{number}</p>}
        {children}
      </div>
    </header>
  )
}

/** The last line of every document. */
export function Foot({ letterhead }) {
  return letterhead.footer ? <p className="doc-foot">{letterhead.footer}</p> : null
}

/** A big stamp (PAID, OVERDUE ...). */
export function Stamp({ text, tone = 'neutral' }) {
  return text ? <div className={`doc-stamp doc-stamp--${tone}`}>{text}</div> : null
}

/** "Label: value" facts. Rows with an empty value are left out. */
export function Facts({ rows }) {
  const shown = rows.filter(([, value]) => value !== null && value !== undefined && value !== '')
  return (
    <dl className="doc-facts">
      {shown.map(([label, value]) => (
        <div key={label} style={{ display: 'contents' }}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Who the document is for. */
export function Party({ title, organization }) {
  return (
    <div>
      <p className="doc-label">{title}</p>
      <strong>{organization.name}</strong>
      {organization.address && <div>{organization.address}</div>}
      {organization.country && <div>{organization.country}</div>}
      {(organization.phone || organization.email) && <div>{[organization.phone, organization.email].filter(Boolean).join(' · ')}</div>}
    </div>
  )
}
