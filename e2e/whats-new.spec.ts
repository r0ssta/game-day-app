import { expect, test, type Page } from '@playwright/test'
import { CHANGELOG, previewChangelog } from '../src/data/changelog'
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

    const preview = previewChangelog()
    const older = CHANGELOG.slice(preview.length)

    await injectStaffSession(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Staff Login' })).toHaveCount(0)

    const unread = page.getByRole('button', { name: /what's new, new updates available/i })
    await expect(unread).toBeVisible()
    await unread.click()

    await expect(page.getByRole('heading', { name: /what.?s new/i })).toBeVisible()
    for (const release of preview) {
      await expect(page.getByText(release.title, { exact: true })).toBeVisible()
      const firstFeature = release.features[0]
      if (firstFeature) await expect(page.getByText(firstFeature)).toBeVisible()
    }
    await expect(page.getByRole('link', { name: /see all updates/i })).toBeVisible()
    for (const release of older.slice(0, 3)) {
      await expect(page.getByText(release.title, { exact: true })).toHaveCount(0)
    }

    await page.getByRole('link', { name: /see all updates/i }).click()
    await expect(page).toHaveURL(/\/changelog\/?$/)
    await expect(page.getByRole('heading', { name: /what.?s new/i })).toBeVisible()
    for (const release of older.slice(0, 4)) {
      await expect(page.getByText(release.title, { exact: true })).toBeVisible()
    }

    await page.getByRole('button', { name: 'Back to home' }).click()
    await expect(page.getByRole('button', { name: /^what's new$/i })).toBeVisible()
    await expect(unread).toHaveCount(0)
  })
})
