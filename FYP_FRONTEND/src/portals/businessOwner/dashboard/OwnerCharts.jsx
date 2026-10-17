import { useState } from 'react'
import { STATUS_COLORS } from '../../admin/dashboard/dashboardUtils.js'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-10-16" -> "16 Oct" (the dates are plain dates, so no time zone is involved). */
function shortDay(key) {
  const [, month, day] = String(key).split('-').map(Number)
  return `${day} ${MONTHS[month - 1]}`
}

/** A round number at or above the largest value, for the top of the y axis. */
function niceMax(value) {
  if (value <= 4) return 4
  const step = 10 ** Math.floor(Math.log10(value))
  return Math.ceil(value / step) * step
}

const SERIES = [
  { key: 'allocated', label: 'Allocated', color: STATUS_COLORS.Available },
  { key: 'reallocated', label: 'Moved', color: STATUS_COLORS.Assigned },
  { key: 'released', label: 'Released', color: STATUS_COLORS.Busy },
]

const W = 560
const H = 260
const M = { top: 12, right: 8, bottom: 28, left: 30 }

/**
 * Allocation activity of the last days: stacked columns (allocated / moved / released), a legend, a tooltip on hover and a table view.
 * `days` is [{ date, allocated, reallocated, released }]. It redraws, with a short animation, whenever the numbers change.
 */
export function ActivityChart({ days }) {
  const [hover, setHover] = useState(null)
  const [asTable, setAsTable] = useState(false)

  const totals = days.map((day) => day.allocated + day.reallocated + day.released)
  const top = niceMax(Math.max(0, ...totals))
  const plotW = W - M.left - M.right
  const plotH = H - M.top - M.bottom
  const slot = plotW / days.length
  const barW = Math.min(16, slot * 0.6)
  const y = (value) => M.top + plotH - (value / top) * plotH
  const ticks = [0, top / 2, top]

  const legend = (
    <ul className="viz-legend" aria-label="Legend">
      {SERIES.map((series) => (
        <li key={series.key}>
          <span className="viz-legend__swatch" style={{ background: series.color }} />
          {series.label}
        </li>
      ))}
    </ul>
  )

  return (
    <div>
      <div className="viz-head">
        {legend}
        <button type="button" className="viz-toggle" onClick={() => setAsTable((current) => !current)} aria-pressed={asTable}>
          {asTable ? 'Show chart' : 'Show as table'}
        </button>
      </div>

      {asTable ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Day</th>
                <th className="num">Allocated</th>
                <th className="num">Moved</th>
                <th className="num">Released</th>
              </tr>
            </thead>
            <tbody>
              {[...days].reverse().map((day) => (
                <tr key={day.date}>
                  <td>{shortDay(day.date)}</td>
                  <td className="num">{day.allocated}</td>
                  <td className="num">{day.reallocated}</td>
                  <td className="num">{day.released}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="viz-frame" onMouseLeave={() => setHover(null)}>
          <svg className="viz-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Allocations, moves and releases per day for the last days">
            {ticks.map((tick) => (
              <g key={tick}>
                <line x1={M.left} x2={W - M.right} y1={y(tick)} y2={y(tick)} stroke="var(--sand-300)" strokeWidth="1" />
                <text x={M.left - 6} y={y(tick) + 4} textAnchor="end">
                  {Number.isInteger(tick) ? tick : tick.toFixed(1)}
                </text>
              </g>
            ))}

            {days.map((day, index) => {
              const x = M.left + slot * index + (slot - barW) / 2
              let base = 0
              return (
                <g key={day.date} opacity={hover !== null && hover !== index ? 0.55 : 1}>
                  {SERIES.map((series) => {
                    const value = day[series.key]
                    if (!value) return null
                    const from = base
                    base += value
                    return (
                      <rect
                        key={series.key}
                        className="viz-bar"
                        x={x}
                        width={barW}
                        y={y(base)}
                        height={Math.max(0, y(from) - y(base))}
                        rx="3"
                        fill={series.color}
                        stroke="var(--card)"
                        strokeWidth="2"
                      />
                    )
                  })}
                  {index % 2 === days.length % 2 && (
                    <text x={x + barW / 2} y={H - 8} textAnchor="middle">
                      {shortDay(day.date)}
                    </text>
                  )}
                  {/* a wide, invisible target so the tooltip is easy to hit */}
                  <rect
                    x={M.left + slot * index}
                    width={slot}
                    y={M.top}
                    height={plotH}
                    fill="transparent"
                    onMouseEnter={() => setHover(index)}
                    onFocus={() => setHover(index)}
                    tabIndex={0}
                    aria-label={`${shortDay(day.date)}: ${day.allocated} allocated, ${day.reallocated} moved, ${day.released} released`}
                  />
                </g>
              )
            })}
          </svg>

          {hover !== null && (
            <div
              className="viz-tooltip"
              style={{ left: `${Math.min(78, Math.max(0, ((M.left + slot * (hover + 0.5)) / W) * 100 - 8))}%`, top: 0 }}
              role="status"
            >
              <strong>{shortDay(days[hover].date)}</strong>
              {SERIES.map((series) => (
                <div className="viz-tooltip__row" key={series.key}>
                  <span>
                    <span className="viz-legend__swatch" style={{ background: series.color }} /> {series.label}
                  </span>
                  <span>{days[hover][series.key]}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
