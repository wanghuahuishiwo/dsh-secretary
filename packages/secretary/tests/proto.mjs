import { chromium } from 'playwright'
const ROOT = '/Users/wanghuahui/workspace/dsh-secretary'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1680, height: 900 } })
const errors = []
page.on('pageerror', e => errors.push(`${e.message}\n${e.stack}`))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
try {
  await page.goto(`file://${ROOT}/design/time-block-rail.html`)
  await page.waitForTimeout(600)
  await page.locator('#dateLabel').click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${ROOT}/design/picker-day-dark.png` })
  await page.keyboard.press('Escape')
  await page.mouse.click(700, 700)
  await page.waitForTimeout(200)
  // deep view
  await page.locator('#menuBtn').click()
  await page.waitForTimeout(300)
  await page.locator('.mrow[data-go="deep"]').click()
  await page.waitForTimeout(500)
  await page.locator('#dateLabel').click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${ROOT}/design/picker-week-dark.png` })
  // light theme
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light' })
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${ROOT}/design/picker-week-light.png` })
  // back to time view, picker closed, light
  await page.mouse.click(700, 700)
  await page.locator('#menuBtn').click()
  await page.waitForTimeout(300)
  await page.locator('.mrow[data-go="time"]').click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${ROOT}/design/picker-bar-light.png` })
  console.log('errors', JSON.stringify(errors.slice(0, 5)))
} finally {
  await browser.close()
}
