import { expect, test, type Page } from '@playwright/test'
import {
  skipUnlessStaffE2e,
  staffBrowserAuthPayload,
  staffE2eSkipReason,
} from './staff-session'

async function injectStaffSession(page: Page) {
  const payload = await staffBrowserAuthPayload()
  await page.addInitScript(
    ({ storageKey, sessionJson }) => {
      localStorage.setItem(storageKey, sessionJson)
      localStorage.removeItem('last_seen_version')
    },
    payload,
  )
}

test.describe('coach whats new', () => {
  test('staff session opens What’s New and clears the unread dot', async ({ page }) => {
    const reason = staffE2eSkipReason()
    if (reason) {
      skipUnlessStaffE2e(test, reason)
      return
    }

    await injectStaffSession(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Staff Login' })).toHaveCount(0)
    // Boot replaces `/` with `/coach/teams/:id`, which remounts the dashboard
    // and would close a sheet opened before that navigation.
    await expect(page).toHaveURL(/\/coach\/teams\/[^/]+\/?$/)

    const unread = page.getByRole('button', { name: /what's new, new updates available/i })
    await expect(unread).toBeVisible()
    await unread.click()

    const sheet = page.getByRole('dialog', { name: /what.?s new/i })
    await expect(sheet).toBeVisible()
    await expect(sheet.getByText('Scorers under the score')).toBeVisible()
    await expect(sheet.getByText('Confirm an early whistle')).toBeVisible()
    await expect(sheet.getByText('Own goals and Goal taps')).toBeVisible()
    await expect(sheet.getByText(/directly under the score/i)).toBeVisible()
    await expect(sheet.getByText(/more than a minute still on the clock/i)).toBeVisible()
    await expect(sheet.getByText(/Own Goal is a goal type/i)).toBeVisible()
    await expect(sheet.getByRole('link', { name: /see all updates/i })).toBeVisible()
    await expect(sheet.getByText('Change who’s in during the game')).toHaveCount(0)
    await expect(sheet.getByText('Scheduling and full game time')).toHaveCount(0)
    await expect(sheet.getByText('Smoother game days')).toHaveCount(0)
    await expect(sheet.getByText('Recaps you can trust')).toHaveCount(0)

    await sheet.getByRole('link', { name: /see all updates/i }).click()
    await expect(page).toHaveURL(/\/changelog\/?$/)
    await expect(page.getByRole('heading', { name: /what.?s new/i })).toBeVisible()
    await expect(page.getByText('Scorers under the score')).toBeVisible()
    await expect(page.getByText('Change who’s in during the game')).toBeVisible()
    await expect(page.getByText('Scheduling and full game time')).toBeVisible()
    await expect(page.getByText('Smoother game days')).toBeVisible()
    await expect(page.getByText('Recaps you can trust')).toBeVisible()
    await expect(page.getByText('Clearer sideline')).toBeVisible()
    await expect(page.getByText('Faster live match')).toBeVisible()
    await expect(page.getByText('Parent Hub recaps')).toBeVisible()

    await page.getByRole('button', { name: 'Back to home' }).click()
    await expect(page.getByRole('button', { name: /^what's new$/i })).toBeVisible()
    await expect(unread).toHaveCount(0)
  })
})
