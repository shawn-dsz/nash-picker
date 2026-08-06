// Demo beats for OnePick. Re-runnable: `npm run seed` first, then
//   node ~/.claude/skills/product-demo/scripts/record.mjs demo/beats.mjs --out docs/media
//
// Records FM-1002 (DoorDash) because that one order carries three of the four
// things worth showing: a weighted partial, the scan gate catching a lookalike,
// and a write back to Nash. The viewport is phone-shaped on purpose - the app
// is a 420px handheld layout, so a desktop capture would be mostly dead space.

export const config = {
  url: 'https://onepick-production.up.railway.app',
  ready: 'a[href^="/pick/"]',
  viewport: { width: 440, height: 880 },
}

const BANANAS = '930000000011'
const CHICKEN = '930000000028'
const COKE_CLASSIC = '930000001005' // the wrong one, on purpose
const DIET_COKE = '930000001012'

/** The handheld scans and sends a return. Typing plus Enter is the same path. */
const scan = async (page, demo, code) => {
  await demo.type('input[placeholder="Barcode"]', code)
  await page.keyboard.press('Enter')
}

export const beats = [
  {
    name: 'queue',
    async run(page) {
      // Four orders, three channels, one list. Nothing to do but let it land.
      await page.getByText(/orders to pick across/i).waitFor({ timeout: 30_000 })
      await page.getByText('DoorDash').first().waitFor({ timeout: 30_000 })
    },
  },
  {
    name: 'locate',
    async run(page) {
      await page.getByRole('link', { name: /Marcus Webb/ }).click()
      // Route strip and the aisle/bay/shelf card are the proof this beat landed.
      await page.getByText(/^Route$/i).waitFor({ timeout: 30_000 })
      await page.getByRole('heading', { name: 'Bananas Loose' }).waitFor({ timeout: 30_000 })
    },
  },
  {
    name: 'weigh',
    async run(page, demo) {
      await scan(page, demo, BANANAS)
      await page.getByText(/barcode verified/i).waitFor({ timeout: 15_000 })
      await page.getByRole('button', { name: /enter weight/i }).click()
      // 0.94kg against a 1kg order. Neither picked nor not-picked.
      await demo.type('input[type="number"]', '0.94', 140)
      await page.getByRole('button', { name: /^confirm$/i }).click()
      await page.getByRole('heading', { name: 'Chicken Breast Deli' }).waitFor({ timeout: 15_000 })
    },
  },
  {
    name: 'scan-catches-it',
    async run(page, demo) {
      await scan(page, demo, CHICKEN)
      await page.getByRole('button', { name: /^picked/i }).click()
      await page.getByRole('heading', { name: 'Diet Coke 1.25L' }).waitFor({ timeout: 15_000 })
      // Three lookalike colas share this shelf. Scan the wrong one.
      await scan(page, demo, COKE_CLASSIC)
      await page.getByText(/wrong item/i).waitFor({ timeout: 15_000 })
      await page.getByText(/that is coca-cola classic/i).waitFor({ timeout: 15_000 })
    },
  },
  {
    name: 'written-back',
    async run(page, demo) {
      await page.getByRole('button', { name: /^rescan$/i }).click()
      await scan(page, demo, DIET_COKE)
      await page.getByText(/barcode verified/i).waitFor({ timeout: 15_000 })
      await page.getByRole('button', { name: /^picked$/i }).click()
      await page.getByText(/run complete/i).waitFor({ timeout: 30_000 })
      // The result is real: this is read back from Nash, not a success toast.
      await page.getByText(/saved to nash/i).waitFor({ timeout: 30_000 })
    },
  },
]
