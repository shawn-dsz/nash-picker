/**
 * Builds public/products/<SKU>.jpg from the sources listed below.
 *
 * WHY THE IMAGES ARE COMMITTED RATHER THAN HOTLINKED
 * --------------------------------------------------
 * A live demo that fetches fourteen thumbnails from two third parties has
 * fourteen ways to show a broken image in front of a room. Committed files
 * have none, and the seed writes a same-origin path into Nash, so the picker
 * renders from the app that is already serving the page.
 *
 * Every source is a real supermarket product photograph, CC-licensed. Nothing
 * here is a placeholder or a generated image - the point of the catalog is
 * that three colas look alike on a shelf, and that only survives if the
 * pictures are of the actual packs. See public/products/CREDITS.md.
 *
 * Each image is padded to a square in its own background colour rather than
 * cropped to one. The picker renders a fixed square tile: cropping a portrait
 * bottle shot to it cuts the label off, which is the one thing the picture
 * exists to show. padColor is the median of the source's border pixels.
 *
 * Uses macOS `sips`. Deliberately not a dependency - this runs once when the
 * catalog changes, and the output is committed. Run with: npm run images
 */

import { execFile } from "node:child_process";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { promisify } from "node:util";

const run = promisify(execFile);

const OUT = "public/products";
const TMP = "public/products/.tmp";
const SIZE = 400;

/** Wikimedia rejects requests without a contact in the agent string. */
const AGENT = "onepick-demo/0.1 (grocery picking demo; runwithfire555@gmail.com)";

const SOURCES = [
  {
    sku: "PRD-BAN-001",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/Single_bananas_in_a_bunch.jpg/500px-Single_bananas_in_a_bunch.jpg",
    padColor: "7D603D",
    credit: "Single bananas in a bunch - Wikimedia Commons, CC BY-SA 4.0",
  },
  {
    sku: "PRD-CHK-002",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b8/Raw_chicken_slices.jpg/500px-Raw_chicken_slices.jpg",
    padColor: "9EADA9",
    credit: "Raw chicken slices - Wikimedia Commons, CC0",
  },
  // The three lookalikes. Same shelf in the seed, three different labels -
  // red, silver, black - which is the whole reason the scan gate exists.
  {
    sku: "BEV-COKE-100",
    url: "https://images.openfoodfacts.org/images/products/930/067/500/1113/3.400.jpg",
    padColor: "FFFFFF",
    credit: "Coca-Cola Classic (barcode 9300675001113) - Open Food Facts, CC BY-SA 3.0",
  },
  {
    sku: "BEV-COKE-101",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a6/Diet_coke_1.jpg/500px-Diet_coke_1.jpg",
    padColor: "41413F",
    credit: "Diet coke 1.jpg - Wikimedia Commons, CC BY 2.0",
  },
  {
    sku: "BEV-COKE-102",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/ce/Coca_Cola_Zero_bottle.png/500px-Coca_Cola_Zero_bottle.png",
    padColor: "000000",
    credit: "Coca Cola Zero bottle - Wikimedia Commons, public domain",
  },
  // The substitution pair, both on aisle 2.
  {
    sku: "DRY-PAS-201",
    url: "https://images.openfoodfacts.org/images/products/933/968/720/6605/front_en.3.full.jpg",
    padColor: "C66F2C",
    credit: "Woolworths Essentials Spirals (9339687206605) - Open Food Facts, CC BY-SA 3.0",
  },
  {
    sku: "DRY-PAS-200",
    url: "https://images.openfoodfacts.org/images/products/807/680/208/5738/front_en.3506.full.jpg",
    padColor: "FFFFFF",
    credit: "Barilla Penne Rigate n.73 (8076802085738) - Open Food Facts, CC BY-SA 3.0",
  },
  {
    sku: "BKY-BRD-500",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/Loaf_of_sourdough_bread_cooling.jpg/500px-Loaf_of_sourdough_bread_cooling.jpg",
    padColor: "80643F",
    credit: "Loaf of sourdough bread cooling - Wikimedia Commons, CC0",
  },
  {
    sku: "DRY-RIC-202",
    url: "https://images.openfoodfacts.org/images/products/930/063/328/9317/front_en.3.full.jpg",
    padColor: "B1A198",
    credit: "Woolworths Basmati Rice (9300633289317) - Open Food Facts, CC BY-SA 3.0",
  },
  {
    sku: "DRY-OIL-203",
    url: "https://images.openfoodfacts.org/images/products/085/269/600/0198/front_en.3.full.jpg",
    padColor: "94836F",
    credit: "Cobram Estate Extra Virgin Olive Oil (0852696000198) - Open Food Facts, CC BY-SA 3.0",
  },
  {
    sku: "CHL-MLK-300",
    url: "https://images.openfoodfacts.org/images/products/930/060/118/6945/front_en.62.full.jpg",
    padColor: "696157",
    credit: "Coles Full Cream Milk (9300601186945) - Open Food Facts, CC BY-SA 3.0",
  },
  {
    sku: "CHL-YOG-301",
    url: "https://images.openfoodfacts.org/images/products/930/063/363/1536/front_en.3.full.jpg",
    padColor: "735752",
    credit: "Woolworths Natural Greek Style Yoghurt (9300633631536) - Open Food Facts, CC BY-SA 3.0",
  },
  {
    sku: "CHL-CHE-302",
    url: "https://images.openfoodfacts.org/images/products/408/870/015/6629/front_en.26.full.jpg",
    padColor: "7EA069",
    credit: "Westacre Dairy Tasty Cheese Block (4088700156629) - Open Food Facts, CC BY-SA 3.0",
  },
  {
    sku: "FRZ-PEA-400",
    url: "https://images.openfoodfacts.org/images/products/931/008/140/8284/front_en.3.full.jpg",
    padColor: "493123",
    credit: "Birds Eye Australian Garden Peas (9310081408284) - Open Food Facts, CC BY-SA 3.0",
  },
];

await mkdir(TMP, { recursive: true });

for (const s of SOURCES) {
  const res = await fetch(s.url, { headers: { "User-Agent": AGENT } });
  if (!res.ok) throw new Error(`${s.sku}: ${res.status} ${s.url}`);

  const raw = `${TMP}/${s.sku}.src`;
  await writeFile(raw, Buffer.from(await res.arrayBuffer()));

  // Two passes, because sips will not resize and pad in one. Fit inside the
  // square first, then grow the canvas to it - so nothing is ever cropped.
  const fitted = `${TMP}/${s.sku}.fit.jpg`;
  await run("sips", ["-s", "format", "jpeg", "-Z", String(SIZE), raw, "--out", fitted]);
  await run("sips", [
    "-p", String(SIZE), String(SIZE),
    "--padColor", s.padColor,
    "-s", "formatOptions", "80",
    fitted, "--out", `${OUT}/${s.sku}.jpg`,
  ]);

  console.log(`  \x1b[32m✓\x1b[0m ${s.sku}  #${s.padColor}  ${s.credit.split(" - ")[1]}`);
}

await rm(TMP, { recursive: true, force: true });

const credits = [
  "# Product image credits",
  "",
  "Every image in this folder is a photograph of a real supermarket product,",
  "fetched and squared by `scripts/images/build.mjs` (`npm run images`).",
  "Sources are Open Food Facts and Wikimedia Commons. Open Food Facts photos",
  "are CC BY-SA 3.0; the Commons files carry the licence noted against each.",
  "",
  "Brand names and packaging remain the trademarks of their owners. These are",
  "used here to populate a demonstration catalog, not to represent any brand.",
  "",
  ...SOURCES.flatMap((s) => [`- **${s.sku}** - ${s.credit}`, `  <${s.url}>`]),
  "",
].join("\n");

await writeFile(`${OUT}/CREDITS.md`, credits);
console.log(`\n  ${SOURCES.length} images written to ${OUT}, credits recorded\n`);
