// Builds FYP_Proposal.pptx: 9 slides for the project proposal (ORIC registration).
// Slides 5-9 tell the "shared pool" story with PowerPoint's Morph transition: the same human icons (named "!!p1" ... "!!p10")
// sit in the pool or inside an organization on each slide, and Morph slides them from one place to the other.
//
//   npm install      (once)
//   node build_slides.js
//
const path = require('path')
const fs = require('fs')
const pptxgen = require('pptxgenjs')
const React = require('react')
const ReactDOMServer = require('react-dom/server')
const sharp = require('sharp')
const fa = require('react-icons/fa')
const JSZip = require('jszip')
const { applyTheme } = require(path.join(__dirname, 'scripts', 'apply_theme.js'))

const OUT = path.join(__dirname, 'FYP_Proposal.pptx')

// ---------------------------------------------------------------- colours and fonts (simple and decent)
const NAVY = '1F2F5C'
const NAVY_SOFT = '2C4286'
const INK = '1B2338'
const MUTED = '5E6A85'
const BG = 'FBF8F3'
const WHITE = 'FFFFFF'
const ORANGE = 'F28C28'
const ORANGE_DARK = 'C96A12'
const LINE = 'E4DED3'
const GREY = '8A93A8'
const GHOST = 'DADFE8'
const RED = 'C0392B'
const FONT = 'Calibri'

const THEME = {
  name: 'FYP Workforce',
  headFontFace: FONT,
  bodyFontFace: FONT,
  colors: {
    dk1: INK, lt1: WHITE, dk2: NAVY, lt2: BG,
    accent1: ORANGE, accent2: NAVY_SOFT, accent3: '1B8A8F', accent4: GREY, accent5: RED, accent6: '5BA66B',
    hlink: NAVY, folHlink: MUTED,
  },
}

// ---------------------------------------------------------------- icons (react-icons rendered to PNG)
const iconCache = new Map()
async function icon(name, color, px = 256) {
  const key = `${name}-${color}`
  if (iconCache.has(key)) return iconCache.get(key)
  const Comp = fa[name]
  if (!Comp) throw new Error(`Unknown icon ${name}`)
  const svg = ReactDOMServer.renderToStaticMarkup(React.createElement(Comp, { color: `#${color}`, size: px }))
  const buf = await sharp(Buffer.from(svg)).resize(px, px, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
  const data = 'image/png;base64,' + buf.toString('base64')
  iconCache.set(key, data)
  return data
}

// ---------------------------------------------------------------- the people (one named image per person so Morph can move them)
const PW = 0.34
const PH = 0.39
let personImg

const CX = 6.665 // pool centre
const CY = 3.65
const R = 1.25
const poolSlot = (k) => ({ x: CX - 1.0 + ((k - 1) % 5) * 0.5 - PW / 2, y: (k - 1) < 5 ? CY - 0.4 : CY + 0.1 })

const CARD_W = 2.7
const CARD_H = 1.5
const ORGS = {
  bus: { x: 0.7, y: 1.6, label: 'Bus Service', icon: 'FaBus' },
  uni: { x: 9.93, y: 1.6, label: 'University', icon: 'FaUniversity' },
  rest: { x: 0.7, y: 4.0, label: 'Restaurant', icon: 'FaUtensils' },
  clinic: { x: 9.93, y: 4.0, label: 'Clinic', icon: 'FaClinicMedical' },
  school: { x: 5.315, y: 5.65, label: 'School', icon: 'FaSchool' },
}
const orgSlot = (org, j) => ({ x: ORGS[org].x + 0.35 + j * 0.5, y: ORGS[org].y + 0.88 })

// Where everybody is on each slide of the story. Persons are numbered 1..10; an array lists who is inside that organization.
const STATES = [
  {
    chip: '8:30 AM', pool: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    sub: '10 trained people are shared by 5 organizations. Each organization says what it needs.',
    at: { bus: [], uni: [], rest: [], clinic: [], school: [] },
    status: { bus: 'needs 2', uni: 'needs 2', rest: 'needs 1', clinic: 'needs 2', school: 'needs 2' },
    arrows: {},
  },
  {
    chip: '9 AM – 2 PM', pool: [10],
    sub: 'The AI autopilot sends the best-fit people: skills, rating and availability.',
    at: { bus: [1, 2], uni: [3, 4], rest: [5], clinic: [6, 7], school: [8, 9] },
    status: { bus: 'has 2 of 2', uni: 'has 2 of 2', rest: 'has 1 of 1', clinic: 'has 2 of 2', school: 'has 2 of 2' },
    arrows: { bus: ['send', 'sends 2'], uni: ['send', 'sends 2'], rest: ['send', 'sends 1'], clinic: ['send', 'sends 2'], school: ['send', 'sends 2'] },
  },
  {
    chip: '2 PM', pool: [],
    sub: 'University and School return one person each. The restaurant rush gets all 3 free people.',
    at: { bus: [1, 2], uni: [3], rest: [5, 10, 4, 9], clinic: [6, 7], school: [8] },
    status: { bus: 'has 2 of 2', uni: 'returned 1', rest: 'rush: needs 4', clinic: 'has 2 of 2', school: 'returned 1' },
    arrows: { uni: ['ret', 'returns 1'], school: ['ret', 'returns 1'], rest: ['send', 'sends 3'] },
  },
  {
    chip: '3 PM – 5 PM', pool: [9],
    sub: 'The rush is over: 3 people go back and are re-assigned where they are needed now.',
    at: { bus: [1, 2], uni: [3, 10], rest: [5], clinic: [6, 7], school: [8, 4] },
    status: { bus: 'has 2 of 2', uni: 'needs 2', rest: 'needs 1', clinic: 'has 2 of 2', school: 'needs 2' },
    arrows: { rest: ['ret', 'returns 3'], uni: ['send', 'sends 1'], school: ['send', 'sends 1'] },
  },
  {
    chip: '5 PM', pool: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    sub: 'End of the day: everybody is back in the shared pool.',
    at: { bus: [], uni: [], rest: [], clinic: [], school: [] },
    status: { bus: 'back in pool', uni: 'back in pool', rest: 'back in pool', clinic: 'back in pool', school: 'back in pool' },
    arrows: { bus: ['ret', 'returns 2'], uni: ['ret', 'returns 2'], rest: ['ret', 'returns 1'], clinic: ['ret', 'returns 2'], school: ['ret', 'returns 2'] },
  },
]

// geometry helpers for the arrows between the pool and an organization
function rectEdge(rx, ry, rw, rh, tx, ty) {
  const cx = rx + rw / 2
  const cy = ry + rh / 2
  const dx = tx - cx
  const dy = ty - cy
  const s = Math.min(dx === 0 ? Infinity : rw / 2 / Math.abs(dx), dy === 0 ? Infinity : rh / 2 / Math.abs(dy))
  return { x: cx + dx * s, y: cy + dy * s }
}
function arrowEnds(org) {
  const o = ORGS[org]
  const ox = o.x + CARD_W / 2
  const oy = o.y + CARD_H / 2
  const d = Math.hypot(ox - CX, oy - CY)
  const pool = { x: CX + ((ox - CX) / d) * (R + 0.07), y: CY + ((oy - CY) / d) * (R + 0.07) }
  const card = rectEdge(o.x, o.y, CARD_W, CARD_H, CX, CY)
  const gap = 0.07
  const dd = Math.hypot(card.x - pool.x, card.y - pool.y)
  const cardG = { x: card.x - ((card.x - pool.x) / dd) * gap, y: card.y - ((card.y - pool.y) / dd) * gap }
  return { pool, card: cardG }
}

// ---------------------------------------------------------------- build
async function main() {
  const pres = new pptxgen()
  pres.layout = 'LAYOUT_WIDE' // 13.33 x 7.5
  pres.title = 'Smart Workforce Optimization and Resource Sharing System for Multi-Organization Call Centers'
  pres.author = 'Abdul Moueed Alvi, Muhammad Ahmad Ijaz'
  pres.subject = 'FYP project proposal'
  pres.theme = { headFontFace: FONT, bodyFontFace: FONT }

  personImg = await icon('FaUser', ORANGE)
  const personGrey = await icon('FaUser', GREY)
  const personGhost = await icon('FaUser', GHOST)

  pres.defineSlideMaster({
    title: 'FYP_TITLE',
    background: { color: NAVY },
    objects: [],
  })
  pres.defineSlideMaster({
    title: 'FYP_CONTENT',
    background: { color: BG },
    slideNumber: { x: 12.3, y: 7.0, w: 0.6, h: 0.3, fontFace: FONT, fontSize: 10, color: MUTED, align: 'right' },
    objects: [
      { placeholder: { options: { name: 'title', type: 'title', x: 0.66, y: 0.32, w: 9.2, h: 0.7, fontFace: FONT, fontSize: 32, bold: true, color: NAVY, margin: 0, valign: 'middle', align: 'left' }, text: '' } },
    ],
  })

  const addTitle = (slide, text) => slide.addText(text, { placeholder: 'title' })
  const card = (slide, x, y, w, h, name) =>
    slide.addShape(pres.ShapeType.roundRect, {
      x, y, w, h, rectRadius: 0.12, fill: { color: WHITE }, line: { color: LINE, width: 1 },
      shadow: { type: 'outer', color: '000000', opacity: 0.08, blur: 8, offset: 2, angle: 90 }, objectName: name,
    })
  const iconCircle = async (slide, name, x, y, d, fill, iconColor, objectName) => {
    slide.addShape(pres.ShapeType.ellipse, { x, y, w: d, h: d, fill: { color: fill }, line: { color: fill, width: 0 }, objectName: objectName + ' circle' })
    const s = d * 0.5
    slide.addImage({ data: await icon(name, iconColor), x: x + (d - s) / 2, y: y + (d - s) / 2, w: s, h: s, altText: '', objectName: objectName + ' icon' })
  }

  // ======================================================== 1. Title
  pres.addSection({ title: 'Introduction' })
  {
    const s = pres.addSlide({ masterName: 'FYP_TITLE', sectionTitle: 'Introduction' })
    s.addText('PROJECT PROPOSAL', { x: 0.8, y: 1.2, w: 7.4, h: 0.4, fontFace: FONT, fontSize: 16, bold: true, color: ORANGE, charSpacing: 4, margin: 0, isTextBox: true, objectName: 'Label' })
    s.addText('Smart Workforce Optimization and Resource Sharing System for Multi-Organization Call Centers', {
      x: 0.8, y: 1.75, w: 7.5, h: 2.5, fontFace: FONT, fontSize: 36, bold: true, color: WHITE, margin: 0, valign: 'top', isTextBox: true, objectName: 'Project title',
    })
    s.addText('Abdul Moueed Alvi (233536)   ·   Muhammad Ahmad Ijaz (233566)', { x: 0.8, y: 4.3, w: 7.6, h: 0.4, fontFace: FONT, fontSize: 16, color: WHITE, margin: 0, isTextBox: true, objectName: 'Team' })
    s.addText('Supervisor: Dr Muhammad Sanaullah   ·   Co-Supervisor: Mr. Malik Kashif', { x: 0.8, y: 4.85, w: 7.6, h: 0.4, fontFace: FONT, fontSize: 14, color: 'C9D2EA', margin: 0, isTextBox: true, objectName: 'Supervisors' })
    // the shared pool as a motif
    s.addShape(pres.ShapeType.ellipse, { x: 8.7, y: 1.75, w: 3.9, h: 3.9, fill: { color: NAVY_SOFT }, line: { color: NAVY_SOFT, width: 0 }, objectName: 'Pool circle' })
    for (let k = 1; k <= 10; k++) {
      const col = (k - 1) % 5
      const row = (k - 1) < 5 ? 0 : 1
      s.addImage({ data: personImg, x: 9.3 + col * 0.54, y: 3.0 + row * 0.7, w: 0.4, h: 0.46, altText: 'Employee', objectName: `Person ${k}` })
    }
    s.addText('SHARED POOL', { x: 8.7, y: 2.25, w: 3.9, h: 0.4, fontFace: FONT, fontSize: 16, bold: true, color: WHITE, align: 'center', margin: 0, isTextBox: true, objectName: 'Pool label' })
    s.addText('10 people · 5 organizations', { x: 8.7, y: 4.55, w: 3.9, h: 0.4, fontFace: FONT, fontSize: 14, color: 'C9D2EA', align: 'center', margin: 0, isTextBox: true, objectName: 'Pool caption' })
    s.addNotes('Introduce the team and the project title. The circle on the right is the idea in one picture: one shared pool of people that many organizations use.')
  }

  // ======================================================== 2. Problem statement
  {
    const s = pres.addSlide({ masterName: 'FYP_CONTENT', sectionTitle: 'Introduction' })
    addTitle(s, 'Problem Statement')
    const rows = [
      ['FaHourglassHalf', 'Idle staff, then overload', 'Demand changes hour by hour, but staff numbers stay fixed'],
      ['FaCoins', 'High labour cost', 'Each organization hires extra staff on its own for peak times'],
      ['FaUsers', 'Fixed teams only', 'Traditional systems cannot share people between organizations'],
      ['FaEyeSlash', 'No live visibility', 'Nobody sees who is working where, right now'],
    ]
    for (let i = 0; i < rows.length; i++) {
      const y = 1.5 + i * 1.3
      await iconCircle(s, rows[i][0], 0.66, y + 0.08, 0.75, NAVY, WHITE, `Problem ${i + 1}`)
      s.addText(rows[i][1], { x: 1.7, y, w: 5.4, h: 0.4, fontFace: FONT, fontSize: 20, bold: true, color: NAVY, margin: 0, isTextBox: true, objectName: `Problem ${i + 1} title` })
      s.addText(rows[i][2], { x: 1.7, y: y + 0.42, w: 5.4, h: 0.6, fontFace: FONT, fontSize: 16, color: INK, margin: 0, valign: 'top', isTextBox: true, objectName: `Problem ${i + 1} text` })
    }
    // right: the picture of the problem
    card(s, 7.7, 1.5, 4.97, 5.2, 'Today card')
    s.addText('Today: no sharing', { x: 7.95, y: 1.65, w: 4.5, h: 0.4, fontFace: FONT, fontSize: 20, bold: true, color: NAVY, margin: 0, isTextBox: true, objectName: 'Today title' })
    // organization A: idle people
    s.addShape(pres.ShapeType.roundRect, { x: 8.0, y: 2.3, w: 4.37, h: 1.55, rectRadius: 0.1, fill: { color: 'F1F3F8' }, line: { color: LINE, width: 1 }, objectName: 'Org A box' })
    s.addText('Organization A · quiet hours', { x: 8.2, y: 2.38, w: 4.0, h: 0.35, fontFace: FONT, fontSize: 16, bold: true, color: INK, margin: 0, isTextBox: true, objectName: 'Org A label' })
    for (let k = 0; k < 3; k++) s.addImage({ data: personGrey, x: 8.25 + k * 0.55, y: 2.85, w: 0.4, h: 0.46, altText: 'Idle employee', objectName: `Idle ${k + 1}` })
    s.addText('3 people sit idle', { x: 10.1, y: 2.9, w: 2.2, h: 0.4, fontFace: FONT, fontSize: 16, bold: true, color: MUTED, margin: 0, isTextBox: true, objectName: 'Idle text' })
    // no link between them
    s.addImage({ data: await icon('FaBan', RED), x: 9.95, y: 4.05, w: 0.5, h: 0.5, altText: 'No sharing', objectName: 'No sharing icon' })
    s.addText('no way to share', { x: 10.6, y: 4.1, w: 1.9, h: 0.4, fontFace: FONT, fontSize: 14, bold: true, color: RED, margin: 0, isTextBox: true, objectName: 'No sharing text' })
    // organization B: missing people
    s.addShape(pres.ShapeType.roundRect, { x: 8.0, y: 4.85, w: 4.37, h: 1.55, rectRadius: 0.1, fill: { color: 'FDEEEC' }, line: { color: 'F0C4BE', width: 1 }, objectName: 'Org B box' })
    s.addText('Organization B · peak hours', { x: 8.2, y: 4.93, w: 4.0, h: 0.35, fontFace: FONT, fontSize: 16, bold: true, color: INK, margin: 0, isTextBox: true, objectName: 'Org B label' })
    for (let k = 0; k < 3; k++) s.addImage({ data: personGhost, x: 8.25 + k * 0.55, y: 5.4, w: 0.4, h: 0.46, altText: 'Missing employee', objectName: `Missing ${k + 1}` })
    s.addText('3 people missing', { x: 10.1, y: 5.45, w: 2.2, h: 0.4, fontFace: FONT, fontSize: 16, bold: true, color: RED, margin: 0, isTextBox: true, objectName: 'Missing text' })
    s.addNotes('Organizations hire extra staff for peak hours while staff in another organization sit idle at the same time. Fixed teams, no sharing, no live visibility.')
  }

  // ======================================================== 3. Goals and objectives
  {
    const s = pres.addSlide({ masterName: 'FYP_CONTENT', sectionTitle: 'Introduction' })
    addTitle(s, 'Goals and Objectives')
    card(s, 0.66, 1.5, 4.9, 5.2, 'Goals card')
    s.addText('Goals', { x: 0.95, y: 1.68, w: 4.3, h: 0.45, fontFace: FONT, fontSize: 24, bold: true, color: NAVY, margin: 0, isTextBox: true, objectName: 'Goals title' })
    const goals = [
      ['FaChartLine', 'Optimize human resource utilization'],
      ['FaHourglassHalf', 'Reduce employee idle time'],
      ['FaCoins', 'Lower operational costs'],
      ['FaStar', 'Maintain high service quality'],
    ]
    for (let i = 0; i < goals.length; i++) {
      const y = 2.4 + i * 1.07
      await iconCircle(s, goals[i][0], 0.95, y, 0.7, ORANGE, WHITE, `Goal ${i + 1}`)
      s.addText(goals[i][1], { x: 1.85, y, w: 3.5, h: 0.7, fontFace: FONT, fontSize: 18, color: INK, margin: 0, valign: 'middle', isTextBox: true, objectName: `Goal ${i + 1} text` })
    }
    card(s, 5.85, 1.5, 6.82, 5.2, 'Objectives card')
    s.addText('Objectives', { x: 6.15, y: 1.68, w: 6.2, h: 0.45, fontFace: FONT, fontSize: 24, bold: true, color: NAVY, margin: 0, isTextBox: true, objectName: 'Objectives title' })
    const objectives = [
      ['FaSitemap', 'Build a hierarchical workforce system'],
      ['FaUserFriends', 'Manage fixed and on-demand employees'],
      ['FaUsers', 'Maintain one central shared employee pool'],
      ['FaRobot', 'Develop AI-based allocation, with employee consent'],
      ['FaChartBar', 'Provide online dashboards for all users'],
      ['FaHeadset', 'Enable VoIP calls and live monitoring'],
    ]
    for (let i = 0; i < objectives.length; i++) {
      const y = 2.35 + i * 0.7
      await iconCircle(s, objectives[i][0], 6.15, y, 0.55, NAVY, WHITE, `Objective ${i + 1}`)
      s.addText(objectives[i][1], { x: 6.9, y, w: 5.6, h: 0.55, fontFace: FONT, fontSize: 18, color: INK, margin: 0, valign: 'middle', isTextBox: true, objectName: `Objective ${i + 1} text` })
    }
    s.addNotes('Four goals, six objectives. The AI part is the new idea: it allocates people but the employee still accepts or declines.')
  }

  // ======================================================== 4. Solution
  pres.addSection({ title: 'Solution' })
  {
    const s = pres.addSlide({ masterName: 'FYP_CONTENT', sectionTitle: 'Solution' })
    addTitle(s, 'Our Solution')
    // hierarchy
    const chips = ['Business Owner', 'Central Admin', 'Organization', 'Org. Manager', 'Employee']
    const cw = 2.0
    const gap = 0.5
    for (let i = 0; i < chips.length; i++) {
      const x = 0.66 + i * (cw + gap)
      s.addShape(pres.ShapeType.roundRect, { x, y: 1.35, w: cw, h: 0.75, rectRadius: 0.37, fill: { color: NAVY }, line: { color: NAVY, width: 0 }, objectName: `Role ${i + 1}` })
      s.addImage({ data: await icon('FaUser', ORANGE), x: x + 0.18, y: 1.5, w: 0.3, h: 0.34, altText: '', objectName: `Role ${i + 1} icon` })
      s.addText(chips[i], { x: x + 0.55, y: 1.35, w: cw - 0.6, h: 0.75, fontFace: FONT, fontSize: 14, bold: true, color: WHITE, margin: 0, valign: 'middle', isTextBox: true, objectName: `Role ${i + 1} text` })
      if (i < chips.length - 1) s.addImage({ data: await icon('FaChevronRight', GREY), x: x + cw + 0.14, y: 1.58, w: 0.22, h: 0.22, altText: '', objectName: `Role arrow ${i + 1}` })
    }
    const tiles = [
      ['FaUsers', 'Shared employee pool', 'One pool of trained people, shared by all organizations'],
      ['FaRobot', 'AI autopilot', 'Picks the best fit by skills, rating and availability'],
      ['FaExchangeAlt', 'Loans and recall', 'Spare staff are lent out and recalled within 3 minutes'],
      ['FaUserCheck', 'Employee consent', 'Employees accept or decline every assignment'],
      ['FaVideo', 'Live monitoring and calls', 'Real-time status, WebRTC audio and video calls'],
      ['FaCreditCard', 'Billing and reports', 'Invoices, online payments (Safepay), notifications'],
    ]
    const tw = 3.8
    const th = 1.3
    for (let i = 0; i < tiles.length; i++) {
      const x = 0.66 + (i % 3) * (tw + 0.3)
      const y = 2.45 + Math.floor(i / 3) * (th + 0.2)
      card(s, x, y, tw, th, `Feature ${i + 1}`)
      await iconCircle(s, tiles[i][0], x + 0.2, y + 0.3, 0.7, i === 1 ? ORANGE : NAVY, WHITE, `Feature ${i + 1}`)
      s.addText(tiles[i][1], { x: x + 1.1, y: y + 0.15, w: tw - 1.25, h: 0.4, fontFace: FONT, fontSize: 17, bold: true, color: NAVY, margin: 0, isTextBox: true, objectName: `Feature ${i + 1} title` })
      s.addText(tiles[i][2], { x: x + 1.1, y: y + 0.55, w: tw - 1.25, h: 0.65, fontFace: FONT, fontSize: 14, color: INK, margin: 0, valign: 'top', isTextBox: true, objectName: `Feature ${i + 1} text` })
    }
    // what is new
    s.addShape(pres.ShapeType.roundRect, { x: 0.66, y: 5.45, w: 12.0, h: 0.85, rectRadius: 0.1, fill: { color: 'FFF3E3' }, line: { color: 'F5D3A8', width: 1 }, objectName: 'Novelty box' })
    s.addText([
      { text: 'What is new:  ', options: { bold: true, color: ORANGE_DARK } },
      { text: 'staff sharing between many organizations under an agreement, decided by AI, accepted by the employee. Existing tools serve one organization only.', options: { color: INK } },
    ], { x: 0.9, y: 5.45, w: 11.5, h: 0.85, fontFace: FONT, fontSize: 15, margin: 0, valign: 'middle', isTextBox: true, objectName: 'Novelty text' })
    s.addText('Built with React · ASP.NET Core · SQL Server · Python (FastAPI) AI service · Socket.IO · WebRTC', {
      x: 0.66, y: 6.5, w: 12.0, h: 0.35, fontFace: FONT, fontSize: 13, color: MUTED, margin: 0, isTextBox: true, objectName: 'Tech line',
    })
    s.addNotes('Five roles, six building blocks. The next slides show the shared pool working over one day.')
  }

  // ======================================================== 5-9. The shared pool story (Morph)
  pres.addSection({ title: 'Shared pool in action' })
  const orgIcons = {}
  for (const k of Object.keys(ORGS)) orgIcons[k] = await icon(ORGS[k].icon, NAVY)

  for (let si = 0; si < STATES.length; si++) {
    const st = STATES[si]
    const s = pres.addSlide({ masterName: 'FYP_CONTENT', sectionTitle: 'Shared pool in action' })
    addTitle(s, 'How the shared pool works')
    s.addText(st.sub, { x: 0.66, y: 0.98, w: 9.4, h: 0.4, fontFace: FONT, fontSize: 16, color: MUTED, margin: 0, isTextBox: true, objectName: '!!subtitle' })
    // time chip
    s.addShape(pres.ShapeType.roundRect, { x: 10.2, y: 0.4, w: 2.47, h: 0.6, rectRadius: 0.3, fill: { color: NAVY }, line: { color: NAVY, width: 0 }, objectName: '!!chip' })
    s.addText(st.chip, { x: 10.2, y: 0.4, w: 2.47, h: 0.6, fontFace: FONT, fontSize: 18, bold: true, color: WHITE, align: 'center', valign: 'middle', margin: 0, isTextBox: true, objectName: '!!chip text' })

    // organizations
    for (const [key, o] of Object.entries(ORGS)) {
      s.addShape(pres.ShapeType.roundRect, {
        x: o.x, y: o.y, w: CARD_W, h: CARD_H, rectRadius: 0.12, fill: { color: WHITE }, line: { color: LINE, width: 1 },
        shadow: { type: 'outer', color: '000000', opacity: 0.08, blur: 8, offset: 2, angle: 90 }, objectName: `!!org ${key}`,
      })
      s.addImage({ data: orgIcons[key], x: o.x + 0.2, y: o.y + 0.16, w: 0.42, h: 0.42, altText: o.label, objectName: `!!org ${key} icon` })
      s.addText(o.label, { x: o.x + 0.75, y: o.y + 0.1, w: 1.85, h: 0.35, fontFace: FONT, fontSize: 16, bold: true, color: NAVY, margin: 0, isTextBox: true, objectName: `!!org ${key} name` })
      s.addText(st.status[key], { x: o.x + 0.75, y: o.y + 0.43, w: 1.85, h: 0.3, fontFace: FONT, fontSize: 13, color: MUTED, margin: 0, isTextBox: true, objectName: `!!org ${key} status` })
    }
    // the pool
    s.addShape(pres.ShapeType.ellipse, { x: CX - R, y: CY - R, w: 2 * R, h: 2 * R, fill: { color: NAVY }, line: { color: NAVY, width: 0 }, objectName: '!!pool' })
    s.addText('SHARED POOL', { x: CX - 1.0, y: CY - 0.95, w: 2.0, h: 0.35, fontFace: FONT, fontSize: 14, bold: true, color: WHITE, align: 'center', margin: 0, isTextBox: true, objectName: '!!pool label' })
    s.addText(`${st.pool.length} in pool`, { x: CX - 0.9, y: CY + 0.7, w: 1.8, h: 0.35, fontFace: FONT, fontSize: 14, bold: true, color: 'C9D2EA', align: 'center', margin: 0, isTextBox: true, objectName: '!!pool count' })

    // arrows and their labels
    for (const [key, [dir, label]] of Object.entries(st.arrows)) {
      const e = arrowEnds(key)
      const from = dir === 'send' ? e.pool : e.card
      const to = dir === 'send' ? e.card : e.pool
      const colour = dir === 'send' ? NAVY : ORANGE_DARK
      s.addShape(pres.ShapeType.line, {
        x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), w: Math.abs(to.x - from.x), h: Math.abs(to.y - from.y),
        flipH: to.x < from.x, flipV: to.y < from.y, line: { color: colour, width: 3, endArrowType: 'triangle' }, objectName: `!!arrow ${key} ${dir}`,
      })
      const mx = (from.x + to.x) / 2
      const my = (from.y + to.y) / 2
      const vertical = Math.abs(to.y - from.y) > Math.abs(to.x - from.x) * 1.5
      // the label sits beside the arrow (above it, or to its right for an upright arrow), never on top of it
      const lx = vertical ? mx + 0.2 : mx - 0.6
      const ly = vertical ? my - 0.16 : my - 0.5
      s.addText(label, {
        x: lx, y: ly, w: 1.2, h: 0.32, fontFace: FONT, fontSize: 13, bold: true, color: colour, align: vertical ? 'left' : 'center', valign: 'middle', margin: 0,
        isTextBox: true, objectName: `!!arrow ${key} ${dir} label`,
      })
    }

    if (si === 0) {
      // the places that are still empty at the start of the day
      const needs = { bus: 2, uni: 2, rest: 1, clinic: 2, school: 2 }
      for (const [org, n] of Object.entries(needs)) {
        for (let j = 0; j < n; j++) {
          const p = orgSlot(org, j)
          s.addImage({ data: personGhost, x: p.x, y: p.y, w: PW, h: PH, altText: 'Empty place', objectName: `!!ghost ${org} ${j + 1}` })
        }
      }
    }
    // the people (each person is one named picture, so Morph can move it)
    for (let k = 1; k <= 10; k++) {
      let pos
      if (st.pool.includes(k)) pos = poolSlot(k)
      else {
        const org = Object.keys(st.at).find((o) => st.at[o].includes(k))
        pos = orgSlot(org, st.at[org].indexOf(k))
      }
      s.addImage({ data: personImg, x: pos.x, y: pos.y, w: PW, h: PH, altText: `Employee ${k}`, objectName: `!!p${k}` })
    }

    if (si === STATES.length - 1) {
      s.addText('10 people served 5 organizations all day: no extra hiring, no idle staff.', {
        x: 0.7, y: 5.85, w: 4.4, h: 0.95, fontFace: FONT, fontSize: 16, bold: true, color: NAVY, margin: 0, valign: 'top', isTextBox: true, objectName: 'Result text',
      })
      const pills = ['Less idle time', 'Lower cost', 'Better service']
      for (let i = 0; i < pills.length; i++) {
        s.addShape(pres.ShapeType.roundRect, { x: 8.55, y: 5.7 + i * 0.4, w: 2.4, h: 0.34, rectRadius: 0.17, fill: { color: 'FFF3E3' }, line: { color: 'F5D3A8', width: 1 }, objectName: `Result pill ${i + 1}` })
        s.addText(pills[i], { x: 8.55, y: 5.7 + i * 0.4, w: 2.4, h: 0.34, fontFace: FONT, fontSize: 13, bold: true, color: ORANGE_DARK, align: 'center', valign: 'middle', margin: 0, isTextBox: true, objectName: `Result pill ${i + 1} text` })
      }
    }
    const notes = [
      'Start of the day. The shared pool holds 10 trained people. Five organizations tell the system how many people they need.',
      '9 AM to 2 PM. The AI sends people by skill, rating and availability. One person stays in the pool.',
      '2 PM. University and School return one person each. The restaurant has a rush and needs 4, so all 3 free people go there.',
      '3 PM to 5 PM. The restaurant rush is over and 3 people return. University and School ask again and receive one person each.',
      '5 PM. Everybody returns to the pool. Ten people covered five organizations all day, with no extra hiring and no idle staff. Thank you.',
    ]
    s.addNotes(notes[si])
  }

  await pres.writeFile({ fileName: OUT })
  await applyTheme(OUT, THEME)
  await addTransitions(OUT)
  console.log('Saved', OUT)
}

// ---------------------------------------------------------------- transitions: Morph on the story slides, Fade elsewhere
const NS_MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006'
const morph = (ms) =>
  `<mc:AlternateContent xmlns:mc="${NS_MC}"><mc:Choice xmlns:p159="http://schemas.microsoft.com/office/powerpoint/2015/09/main" Requires="p159">` +
  `<p:transition spd="slow" p14:dur="${ms}" xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main"><p159:morph option="byObject"/></p:transition></mc:Choice>` +
  `<mc:Fallback><p:transition spd="slow"><p:fade/></p:transition></mc:Fallback></mc:AlternateContent>`
const fade = '<p:transition spd="med"><p:fade/></p:transition>'

async function addTransitions(file) {
  const zip = await JSZip.loadAsync(fs.readFileSync(file))
  for (let n = 2; n <= 9; n++) {
    const name = `ppt/slides/slide${n}.xml`
    let xml = await zip.file(name).async('string')
    xml = xml.replace(/<p:transition[\s\S]*?<\/p:transition>/, '')
    const t = n >= 6 ? morph(1800) : fade
    xml = xml.includes('<p:timing') ? xml.replace('<p:timing', t + '<p:timing') : xml.replace('</p:sld>', t + '</p:sld>')
    zip.file(name, xml)
  }
  // no folder entries inside the package (some cloud viewers refuse them)
  const clean = new JSZip()
  for (const p of Object.keys(zip.files)) if (!zip.files[p].dir) clean.file(p, await zip.files[p].async('nodebuffer'), { createFolders: false })
  fs.writeFileSync(file, await clean.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
