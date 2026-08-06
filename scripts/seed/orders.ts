import { PRODUCTS } from "./catalog.ts";

/**
 * Four orders, three channels, each demonstrating exactly one thing.
 *
 * Nash has no channel field, so channel rides on `tags` and is normalised in
 * the adapter. The picker view never receives it - channel-blindness is a
 * property of the type rather than a rule someone has to remember.
 *
 * Substitution is set at create time, which confirms the model: the customer
 * pre-authorises a replacement at checkout, the same pattern as Uber Eats.
 * The picker applies a decision that has already been made. They never search
 * for a replacement.
 */

const p = (ext: string) => {
  const found = PRODUCTS.find((x) => x.externalIdentifier === ext);
  if (!found) throw new Error(`No seed product ${ext}`);
  return found;
};

type Line = {
  ext: string;
  count: number;
  substitution?: {
    preference: "substitute" | "refund";
    source: string;
    substituteItems?: { sku: string; quantity: number }[];
  };
};

export type SeedOrder = {
  externalId: string;
  channel: "web" | "doordash" | "uber_eats";
  customer: { first: string; last: string; address: string; phone: string };
  demonstrates: string;
  lines: Line[];
};

export const ORDERS: SeedOrder[] = [
  {
    externalId: "FM-1001",
    channel: "web",
    customer: {
      first: "Priya",
      last: "Nair",
      address: "12 Brisbane St, Ipswich QLD 4305, Australia",
      phone: "+15005550101",
    },
    demonstrates: "Clean run - everything on the shelf",
    lines: [
      { ext: "CHL-MLK-300", count: 2 },
      { ext: "DRY-PAS-200", count: 1 },
      { ext: "FRZ-PEA-400", count: 1 },
      { ext: "CHL-CHE-302", count: 1 },
    ],
  },
  {
    externalId: "FM-1002",
    channel: "doordash",
    customer: {
      first: "Marcus",
      last: "Webb",
      address: "45 Limestone St, Ipswich QLD 4305, Australia",
      phone: "+15005550102",
    },
    demonstrates: "Weighted partial - 1kg ordered, 0.94kg on the scale",
    lines: [
      { ext: "PRD-BAN-001", count: 1 },
      { ext: "PRD-CHK-002", count: 1 },
      { ext: "BEV-COKE-101", count: 1 },
    ],
  },
  {
    externalId: "FM-1003",
    channel: "uber_eats",
    customer: {
      first: "Ana",
      last: "Rossi",
      address: "8 Nicholas St, Ipswich QLD 4305, Australia",
      phone: "+15005550103",
    },
    demonstrates: "Substitution - spirals out of stock, penne pre-approved",
    lines: [
      {
        ext: "DRY-PAS-201",
        count: 1,
        substitution: {
          preference: "substitute",
          source: "customer",
          substituteItems: [{ sku: "DRY-PAS-200", quantity: 1 }],
        },
      },
      { ext: "DRY-RIC-202", count: 1 },
      { ext: "BEV-COKE-102", count: 2 },
    ],
  },
  {
    externalId: "FM-1004",
    channel: "web",
    customer: {
      first: "Tom",
      last: "Fielding",
      address: "30 Roderick St, Ipswich QLD 4305, Australia",
      phone: "+15005550104",
    },
    demonstrates: "Refund preference - offer no substitute at all",
    lines: [
      { ext: "CHL-YOG-301", count: 1 },
      {
        ext: "BKY-BRD-500",
        count: 1,
        substitution: { preference: "refund", source: "customer" },
      },
      { ext: "DRY-OIL-203", count: 1 },
    ],
  },
];

/** POST /v1/order body. */
export function orderPayload(o: SeedOrder, store: string) {
  const subItems = o.lines.map((l, i) => {
    const prod = p(l.ext);
    return {
      id: `${o.externalId}-${i + 1}`,
      sku: prod.sku,
      description: prod.name,
      count: l.count,
      weight: prod.weight,
      valueCents: prod.valueCents * l.count,
      category: prod.categories[0],
      barcode: prod.upc,
      substitution: l.substitution,
    };
  });

  const valueCents = subItems.reduce((n, s) => n + (s.valueCents ?? 0), 0);

  return {
    externalId: o.externalId,
    // Nash has no channel field. Carried here, normalised in the adapter.
    tags: [`channel:${o.channel}`],
    orderMetadata: { channel: o.channel, demonstrates: o.demonstrates },

    // This is the line that turns a delivery into a picking job.
    requirements: ["pick_and_pack"],

    pickupExternalStoreLocationId: store,
    pickupBusinessName: "FreshMart Carlton",
    pickupPhoneNumber: "+15005550005",

    dropoffAddress: o.customer.address,
    dropoffFirstName: o.customer.first,
    dropoffLastName: o.customer.last,
    dropoffPhoneNumber: o.customer.phone,

    deliveryMode: "now",
    currency: "AUD",
    valueCents,
    itemsCount: o.lines.reduce((n, l) => n + l.count, 0),
    description: `${o.channel} order - ${o.demonstrates}`,

    items: [
      {
        id: `${o.externalId}-tote`,
        description: `${o.channel} basket`,
        count: 1,
        valueCents,
        subItems,
      },
    ],
  };
}
