import { expect, test } from '@playwright/test'

test.beforeEach(async ({ context }) => {
  await context.clearCookies()
  await context.addInitScript(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })
})

test('loads the demo treasury home screen', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('link', { name: 'Kolektibo' })).toBeVisible()
  await expect(page.getByText('Stellar Testnet')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Pool' })).toBeVisible()
})

test('navigates through the bottom tabs', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('link', { name: 'Rules' }).click()

  await expect(page).toHaveURL(/\/setup$/)
  await expect(page.getByText('How the AI reads your rules')).toBeVisible()
})
