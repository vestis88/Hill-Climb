// Draws the app icon (an original buggy on a hill) and saves PNGs to public/.
// Run once after changing the design: node scripts/make-icons.cjs
const { chromium } = require('playwright')
const path = require('path')

const draw = `(size) => {
  const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d'); x.scale(size / 100, size / 100)
  const sky = x.createLinearGradient(0, 0, 0, 100); sky.addColorStop(0, '#5fa8e8'); sky.addColorStop(1, '#bfe3f7'); x.fillStyle = sky; x.fillRect(0, 0, 100, 100)
  x.fillStyle = '#ffe58a'; x.beginPath(); x.arc(78, 22, 10, 0, 7); x.fill()
  x.fillStyle = '#8fbfa0'; x.beginPath(); x.moveTo(0, 70); x.quadraticCurveTo(35, 40, 70, 62); x.quadraticCurveTo(88, 70, 100, 58); x.lineTo(100, 100); x.lineTo(0, 100); x.fill()
  x.fillStyle = '#6b4a2f'; x.strokeStyle = '#1d2433'; x.lineWidth = 2.5
  x.beginPath(); x.moveTo(0, 82); x.quadraticCurveTo(50, 68, 100, 80); x.lineTo(100, 100); x.lineTo(0, 100); x.closePath(); x.fill()
  x.strokeStyle = '#4c9a3d'; x.lineWidth = 5; x.beginPath(); x.moveTo(0, 82); x.quadraticCurveTo(50, 68, 100, 80); x.stroke()
  x.save(); x.translate(50, 62); x.rotate(-0.12)
  x.strokeStyle = '#1d2433'; x.lineWidth = 2.5
  x.strokeStyle = '#8b93a1'; x.lineWidth = 3; x.beginPath(); x.moveTo(-12, -4); x.lineTo(-9, -18); x.lineTo(-4, -18); x.stroke()
  x.fillStyle = '#18a5a7'; x.strokeStyle = '#1d2433'; x.lineWidth = 2; x.beginPath(); x.arc(-3, -17, 4.5, 0, 7); x.fill(); x.stroke()
  x.fillStyle = '#e2542f'; x.beginPath(); x.roundRect(-22, -8, 44, 11, 4); x.fill(); x.stroke()
  for (const wx of [-14, 14]) { x.fillStyle = '#2a2f38'; x.beginPath(); x.arc(wx, 5, 7, 0, 7); x.fill(); x.stroke(); x.fillStyle = '#c9ced6'; x.beginPath(); x.arc(wx, 5, 3.5, 0, 7); x.fill() }
  x.restore()
  return c.toDataURL('image/png')
}`

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  for (const size of [180, 192, 512]) {
    const url = await page.evaluate(`(${draw})(${size})`)
    require('fs').writeFileSync(path.join(__dirname, '..', 'public', `icon-${size}.png`), Buffer.from(url.split(',')[1], 'base64'))
  }
  await browser.close()
  console.log('icons written')
})()
