/**
 * The catalog is the demo storyline, not filler.
 *
 * Every product here earns its place:
 *   - Two WEIGHTED items, because weighed goods are why partial quantity is a
 *     requirement at all. A customer orders 1kg of bananas and the picker
 *     weighs 0.94kg - neither picked nor not-picked.
 *   - Three lookalike colas on the same aisle, bay AND shelf, with three
 *     distinct barcodes. This is the customer's own example, and it is what makes
 *     scan verification visibly necessary rather than theoretical.
 *   - One product that is deliberately out of stock and has a pre-approved
 *     substitute, and one that is out of stock where the customer chose refund.
 *
 * Location and price both live on inventory rather than on the product,
 * because both are per-store facts. That is a well-modelled catalog, and it
 * is the reason the adapter has to do a three-way join.
 */

export type SeedProduct = {
  externalIdentifier: string;
  sku: string;
  name: string;
  description: string;
  categories: string[];
  weight: number;
  upc: string;
  weighted?: { weightPerItem: number; weightUnit: string };
  /** Per-store facts. */
  location: { aisle: string; bay: string; shelf: string };
  valueCents: number;
  /** Cents per kg. Only set for WEIGHTED items. */
  centsPerUnit?: number;
  /** Deliberately zero for the out-of-stock scenarios. */
  quantity: number;
  colour: string;
};

const img = (name: string, colour: string) =>
  `https://placehold.co/400x400/${colour}/ffffff/png?text=${encodeURIComponent(name)}`;

export const PRODUCTS: SeedProduct[] = [
  // ---- weighted -----------------------------------------------------------
  {
    externalIdentifier: "PRD-BAN-001",
    sku: "PRD-BAN-001",
    name: "Bananas Loose",
    description: "Cavendish bananas, sold by weight",
    categories: ["Produce", "Fruit"],
    weight: 1,
    upc: "930000000011",
    weighted: { weightPerItem: 0.12, weightUnit: "kg" },
    location: { aisle: "Produce", bay: "P1", shelf: "2" },
    valueCents: 449,
    centsPerUnit: 449,
    quantity: 60,
    colour: "d4b106",
  },
  {
    externalIdentifier: "PRD-CHK-002",
    sku: "PRD-CHK-002",
    name: "Chicken Breast Deli",
    description: "Free range chicken breast, sold by weight",
    categories: ["Deli", "Meat"],
    weight: 1,
    upc: "930000000028",
    weighted: { weightPerItem: 0.25, weightUnit: "kg" },
    location: { aisle: "Deli", bay: "D1", shelf: "1" },
    valueCents: 1490,
    centsPerUnit: 1490,
    quantity: 24,
    colour: "b04a4a",
  },

  // ---- the three lookalikes: same aisle, same bay, same shelf --------------
  {
    externalIdentifier: "BEV-COKE-100",
    sku: "BEV-COKE-100",
    name: "Coca-Cola Classic 1.25L",
    description: "Red label",
    categories: ["Beverages", "Soft Drinks"],
    weight: 1.3,
    upc: "930000001005",
    location: { aisle: "4", bay: "B2", shelf: "3" },
    valueCents: 320,
    quantity: 40,
    colour: "c0392b",
  },
  {
    externalIdentifier: "BEV-COKE-101",
    sku: "BEV-COKE-101",
    name: "Diet Coke 1.25L",
    description: "Silver label. Sits beside Classic and Zero",
    categories: ["Beverages", "Soft Drinks"],
    weight: 1.3,
    upc: "930000001012",
    location: { aisle: "4", bay: "B2", shelf: "3" },
    valueCents: 320,
    quantity: 40,
    colour: "8e9aa5",
  },
  {
    externalIdentifier: "BEV-COKE-102",
    sku: "BEV-COKE-102",
    name: "Coke Zero Sugar 1.25L",
    description: "Black label. Sits beside Classic and Diet",
    categories: ["Beverages", "Soft Drinks"],
    weight: 1.3,
    upc: "930000001029",
    location: { aisle: "4", bay: "B2", shelf: "3" },
    valueCents: 320,
    quantity: 40,
    colour: "2c3e50",
  },

  // ---- substitution pair --------------------------------------------------
  {
    externalIdentifier: "DRY-PAS-201",
    sku: "DRY-PAS-201",
    name: "Spiral Pasta 500g",
    description: "OUT OF STOCK in the seed - the substitution scenario",
    categories: ["Pantry", "Pasta"],
    weight: 0.5,
    upc: "930000002019",
    location: { aisle: "2", bay: "B1", shelf: "2" },
    valueCents: 250,
    quantity: 0,
    colour: "d68910",
  },
  {
    externalIdentifier: "DRY-PAS-200",
    sku: "DRY-PAS-200",
    name: "Penne Pasta 500g",
    description: "The customer's pre-approved substitute for spirals",
    categories: ["Pantry", "Pasta"],
    weight: 0.5,
    upc: "930000002002",
    location: { aisle: "2", bay: "B1", shelf: "2" },
    valueCents: 250,
    quantity: 35,
    colour: "e67e22",
  },

  // ---- refund-preference item ---------------------------------------------
  {
    externalIdentifier: "BKY-BRD-500",
    sku: "BKY-BRD-500",
    name: "Sourdough Loaf",
    description: "OUT OF STOCK in the seed - the refund-preference scenario",
    categories: ["Bakery", "Bread"],
    weight: 0.7,
    upc: "930000005006",
    location: { aisle: "Bakery", bay: "K1", shelf: "1" },
    valueCents: 650,
    quantity: 0,
    colour: "a5673f",
  },

  // ---- the rest of a believable basket ------------------------------------
  {
    externalIdentifier: "DRY-RIC-202",
    sku: "DRY-RIC-202",
    name: "Basmati Rice 1kg",
    description: "Long grain",
    categories: ["Pantry", "Rice"],
    weight: 1,
    upc: "930000002026",
    location: { aisle: "2", bay: "B3", shelf: "1" },
    valueCents: 480,
    quantity: 28,
    colour: "8d6e63",
  },
  {
    externalIdentifier: "DRY-OIL-203",
    sku: "DRY-OIL-203",
    name: "Olive Oil 500ml",
    description: "Extra virgin",
    categories: ["Pantry", "Oils"],
    weight: 0.6,
    upc: "930000002033",
    location: { aisle: "2", bay: "B4", shelf: "2" },
    valueCents: 990,
    quantity: 18,
    colour: "6b8e23",
  },
  {
    externalIdentifier: "CHL-MLK-300",
    sku: "CHL-MLK-300",
    name: "Full Cream Milk 2L",
    description: "Chilled",
    categories: ["Dairy", "Milk"],
    weight: 2,
    upc: "930000003009",
    location: { aisle: "Chilled", bay: "C1", shelf: "1" },
    valueCents: 340,
    quantity: 50,
    colour: "3498db",
  },
  {
    externalIdentifier: "CHL-YOG-301",
    sku: "CHL-YOG-301",
    name: "Greek Yoghurt 1kg",
    description: "Natural",
    categories: ["Dairy", "Yoghurt"],
    weight: 1,
    upc: "930000003016",
    location: { aisle: "Chilled", bay: "C2", shelf: "2" },
    valueCents: 720,
    quantity: 22,
    colour: "5dade2",
  },
  {
    externalIdentifier: "CHL-CHE-302",
    sku: "CHL-CHE-302",
    name: "Tasty Cheese 500g",
    description: "Block",
    categories: ["Dairy", "Cheese"],
    weight: 0.5,
    upc: "930000003023",
    location: { aisle: "Chilled", bay: "C2", shelf: "3" },
    valueCents: 890,
    quantity: 30,
    colour: "f1c40f",
  },
  {
    externalIdentifier: "FRZ-PEA-400",
    sku: "FRZ-PEA-400",
    name: "Frozen Peas 1kg",
    description: "Garden peas",
    categories: ["Frozen", "Vegetables"],
    weight: 1,
    upc: "930000004003",
    location: { aisle: "Frozen", bay: "F1", shelf: "2" },
    valueCents: 420,
    quantity: 33,
    colour: "27ae60",
  },
];

/** POST /v1/products body. Upsert is keyed on externalIdentifier. */
export function productsPayload() {
  return {
    products: PRODUCTS.map((p) => ({
      externalIdentifier: p.externalIdentifier,
      sku: p.sku,
      name: p.name,
      description: p.description,
      imageUrls: [img(p.name, p.colour)],
      categories: p.categories,
      weight: p.weight,
      dimensions: { depth: 10, width: 10, height: 20 },
      identifiers: [{ type: "UPC", value: p.upc }],
      // The flag the picker UI keys off to show a scale instead of a stepper.
      attributes: p.weighted ? ["WEIGHTED"] : [],
      details: p.weighted ? { weightedItemInfo: p.weighted } : undefined,
    })),
  };
}

/** POST /v1/inventory body. Joins on externalProductId, not the Nash id. */
export function inventoryPayload(store: string) {
  return {
    inventory: PRODUCTS.map((p) => ({
      externalProductId: p.externalIdentifier,
      externalStoreLocationId: store,
      quantity: p.quantity,
      valueCents: p.valueCents,
      currency: "AUD",
      // Out of stock is a real inventory state here, not a mocked branch in
      // the UI. The picker meets it the same way they would in the store.
      available: p.quantity > 0,
      location: p.location,
      details: p.centsPerUnit
        ? { weightedItemInfo: { valueCentsPerMeasurementUnit: p.centsPerUnit } }
        : undefined,
    })),
  };
}
