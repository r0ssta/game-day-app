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

    const unread = page.getByRole('button', { name: /what's new, new updates available/i })
    await expect(unread).toBeVisible()
    await unread.click()

    await expect(page.getByRole('heading', { name: /what.?s new/i })).toBeVisible()
    await expect(page.getByText('Edit goals and share the pitch')).toBeVisible()
    await expect(page.getByText('Recaps and the club hub')).toBeVisible()
    await expect(page.getByText('Parent Hub that keeps up')).toBeVisible()
    await expect(page.getByText(/change the scorer, assist, or minute/i)).toBeVisible()
    await expect(page.getByText(/weekend scoreboard/i)).toBeVisible()
    await expect(page.getByText(/live connection goes quiet/i)).toBeVisible()
    await expect(page.getByRole('link', { name: /see all updates/i })).toBeVisible()
    await expect(page.getByText('Named formations and fair minutes')).toHaveCount(0)
    await expect(page.getByText('Confirm an early whistle')).toHaveCount(0)
    await expect(page.getByText('Own goals and Goal taps')).toHaveCount(0)

    await page.getByRole('link', { name: /see all updates/i }).click()
    await expect(page).toHaveURL(/\/changelog\/?$/)
    await expect(page.getByRole('heading', { name: /what.?s new/i })).toBeVisible()
    await expect(page.getByText('Named formations and fair minutes')).toBeVisible()
    await expect(page.getByText('Confirm an early whistle')).toBeVisible()
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
