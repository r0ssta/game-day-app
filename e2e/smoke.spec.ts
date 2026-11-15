import { expect, test } from '@playwright/test'

const HUB_SLUG = 'blitz'
const HUB_PATH = `/hub/${HUB_SLUG}`

test.describe('smoke', () => {
  test('Parent Hub /hub/blitz opens club hub focused on Blitz', async ({ page }) => {
    const pageErrors: Error[] = []
    page.on('pageerror', (error) => {
      pageErrors.push(error)
    })

    const response = await page.goto(HUB_PATH, { waitUntil: 'domcontentloaded' })
    expect(response, 'navigation response').toBeTruthy()
    expect(response!.ok(), `expected OK status, got ${response!.status()}`).toBeTruthy()

    // Legacy team slug resolves into the club Parent Hub, focused on that team.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('heading', { name: /blitz/i })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Loading club…')).toHaveCount(0)
    await expect(page.getByText('Loading team…')).toHaveCount(0)
    await expect(page.locator('p.text-danger')).toHaveCount(0)

    // Back to club tabs: Scoreboard / Teams (replaces Live / Recaps).
    await page.getByRole('button', { name: /^Teams$/i }).first().click()
    await expect(page.getByRole('button', { name: /^Scoreboard$/i })).toBeVisible()
    await expect(page.getByRole('navigation').getByRole('button', { name: /^Teams$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Schedule$/i })).toHaveCount(0)

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

  test('cached Parent Hub API /api/hub/blitz returns team payload', async ({ request }) => {
    const response = await request.get(`/api/hub/${HUB_SLUG}`)
    expect(response.ok(), `hub api status ${response.status()}`).toBeTruthy()
    const payload = (await response.json()) as {
      teamSlug?: string
      teamName?: string
      matches?: unknown[]
    }
    expect(String(payload.teamSlug || '').toLowerCase()).toBe(HUB_SLUG)
    expect(payload.teamName, 'teamName present').toBeTruthy()
    expect(Array.isArray(payload.matches), 'matches array').toBeTruthy()

    const cacheControl = response.headers()['cache-control'] || ''
    expect(cacheControl).toMatch(/s-maxage=60/)
    expect(cacheControl).toMatch(/stale-while-revalidate=30/)
  })
})
