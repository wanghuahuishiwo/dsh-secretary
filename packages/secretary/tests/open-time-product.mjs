export async function clearDialogs(page) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const dialog = page.getByRole('dialog').last()
    if (await dialog.count() === 0 || !await dialog.isVisible()) return
    let clicked = false
    for (const label of ['继续', '知道了', '关闭', '已完成', '稍后', 'Continue', 'Got it', 'Close', 'Done', 'Later']) {
      const button = dialog.getByRole('button', { name: label, exact: true })
      if (await button.count() > 0 && await button.isVisible()) { await button.click(); clicked = true; break }
    }
    if (!clicked) return
  }
}

/** Open only the new product; its first render must succeed without a retry or fixed sleep. */
export async function openTimeRemote(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await clearDialogs(page)
  await page.getByText(/^(Default workspace|默认工作区)$/).first().waitFor({ timeout: 15_000 })
  const newSession = page.getByRole('button', { name: /^(新建会话|New session|New Session)$/ }).first()
  await newSession.waitFor({ timeout: 15_000 })
  await newSession.click()
  await page.waitForFunction(() => document.querySelector('[data-time-remote]') !== null
    || [...document.querySelectorAll('button')].some(button => ['New tab', 'Open right sidebar', '打开右侧边栏'].includes(button.getAttribute('aria-label') ?? '')),
    undefined, { timeout: 30_000 })
  if (await page.locator('[data-time-remote]').count() === 0) {
    const openSidebar = page.getByRole('button', { name: /^(Open right sidebar|打开右侧边栏)$/ })
    if (await openSidebar.count() > 0) await openSidebar.click()
    const tab = page.getByRole('button', { name: /^小秘书-时间块/ }).first()
    const newTab = page.getByRole('button', { name: 'New tab', exact: true })
    if (await tab.count() === 0 && await newTab.count() > 0) await newTab.click()
    await tab.waitFor({ timeout: 15_000 })
    await tab.click()
  }
  await page.locator('[data-time-remote][data-remote-state="ready"]').waitFor({ timeout: 30_000 })
}
