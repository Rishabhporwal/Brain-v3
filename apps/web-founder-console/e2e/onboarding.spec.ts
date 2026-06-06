import { expect, test } from '@playwright/test'

/**
 * End-to-end onboarding click-through (legacy-style 4-step flow): real Keycloak login → Profile →
 * Brand → Platform → Connect → launch straight to the workspace dashboard (no activation gate).
 *
 * Prereqs (CI brings these up; locally: `make -C deploy/local up` + run the BFF on :4000):
 *   Postgres :5440 · ClickHouse :8125 · Keycloak :8080 (realm brain, founder/brain12345) · BFF :4000 · web :3000.
 * global-setup resets tenancy so this is always a fresh "new user" run through all 4 steps.
 */

test('new user signs up, completes onboarding, and lands on the workspace dashboard', async ({ page }) => {
  const stamp = Date.now()
  const slug = `e2e${stamp}`
  const email = `e2e${stamp}@brain.dev`

  // Sign up (Keycloak admin-API create + direct-grant auto-login) → lands on onboarding as a new user.
  await page.goto('/auth/sign-up')
  await page.locator('#email').fill(email)
  await page.locator('#password').fill('test12345')
  await page.locator('#repeat-password').fill('test12345')
  await page.getByRole('button', { name: /^sign up$/i }).click()

  await page.waitForURL(/\/onboarding/)
  await expect(page.getByRole('heading', { name: /welcome to brain/i })).toBeVisible()

  // Step 1 — Profile: name (prefilled or typed) + role.
  await page.locator('#fullName').fill('E2E Founder')
  await page.getByRole('button', { name: /Founder \/ CEO/i }).click()
  await page.getByRole('button', { name: /^continue$/i }).click()

  // Step 2 — Brand: name + handle + industry + revenue.
  await page.locator('#brandName').fill(`E2E Brand ${stamp}`)
  await page.locator('#slug').fill(slug)
  await page.getByRole('button', { name: /Beauty & Cosmetics/i }).click()
  await page.getByRole('button', { name: /10L – ₹50L/i }).click()
  await page.getByRole('button', { name: /^continue$/i }).click()

  // Step 3 — Platform: Shopify.
  await page.getByRole('button', { name: /Shopify/i }).click()
  await page.getByRole('button', { name: /^continue$/i }).click()

  // Step 4 — Connect: enter a handle, then "Skip for now" to launch without the live OAuth round-trip.
  await page.locator('#onb-store-handle').fill('e2e-store')
  await page.getByRole('button', { name: /skip for now/i }).click()

  // Lands on the workspace dashboard (brand created active → reachable immediately).
  await page.waitForURL(new RegExp(`/w/${slug}/dashboard`), { timeout: 30_000 })
  await expect(page).toHaveURL(new RegExp(`/w/${slug}/dashboard`))
})
