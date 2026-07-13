import { expect, test } from '@playwright/test'

test.beforeEach(async ({ context }) => {
  await context.clearCookies()
  await context.addInitScript(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })
})

test('loads the production landing page', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('banner').getByRole('link', { name: 'Kolektibo' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Pooled money your whole group can trust.' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Explore the testnet demo' })).toBeVisible()
})

test('keeps the original treasury flow under the demo route', async ({ page }) => {
  await page.goto('/demo')

  await page.getByRole('link', { name: 'Rules' }).click()

  await expect(page).toHaveURL(/\/demo\/rules$/)
  await expect(page.getByText('How the AI reads your rules')).toBeVisible()
})

test('shows useful empty states for unavailable demo actions', async ({ page }) => {
  await page.goto('/demo/contribute')
  await expect(page.getByText('Create the demo pool first')).toBeVisible()

  await page.goto('/demo/spend')
  await expect(page.getByText('No demo pool to spend from')).toBeVisible()
})
