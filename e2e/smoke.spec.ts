import { expect, test } from '@playwright/test'

const HUB_SLUG = 'blitz'
const HUB_PATH = `/hub/${HUB_SLUG}`

test.describe('smoke', () => {
  test('Parent Hub /hub/blitz renders team UI without uncaught errors', async ({ page }) => {
    const pageErrors: Error[] = []
    page.on('pageerror', (error) => {
      pageErrors.push(error)
    })

    const response = await page.goto(HUB_PATH, { waitUntil: 'domcontentloaded' })
    expect(response, 'navigation response').toBeTruthy()
    expect(response!.ok(), `expected OK status, got ${response!.status()}`).toBeTruthy()

    // Core shell: team title + bottom tab bar (Live / Schedule / Recaps).
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Live$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Schedule$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Recaps$/i })).toBeVisible()

    // Hub finished loading team data (not stuck on error / perpetual loading).
    await expect(page.getByText('Loading team…')).toHaveCount(0)
    await expect(page.locator('p.text-danger')).toHaveCount(0)

    const title = (await page.getByRole('heading', { level: 1 }).innerText()).trim()
    expect(title.toLowerCase()).toContain('blitz')

    expect(pageErrors, `uncaught page errors: ${pageErrors.map((e) => e.message).join('; ')}`).toEqual(
      [],
    )
  })

  test('dynamic manifest /api/manifest?slug=blitz returns team start_url', async ({
    request,
    baseURL,
  }) => {
    const response = await request.get(`/api/manifest?slug=${HUB_SLUG}`)
    expect(response.ok(), `manifest status ${response.status()}`).toBeTruthy()

    const contentType = response.headers()['content-type'] || ''
    expect(contentType).toMatch(/json/i)

    const manifest = (await response.json()) as {
      start_url?: string
      name?: string
      id?: string
    }

    expect(manifest.start_url, 'start_url present').toBeTruthy()

    const expectedPath = `/hub/${HUB_SLUG}`
    const startUrl = String(manifest.start_url)
    // Absolute (preferred) or path-only — both must target this team hub.
    expect(
      startUrl === expectedPath ||
        startUrl.endsWith(expectedPath) ||
        (baseURL != null && startUrl === `${baseURL.replace(/\/$/, '')}${expectedPath}`),
    ).toBeTruthy()

    expect(String(manifest.id || '')).toContain(expectedPath)
  })
})
