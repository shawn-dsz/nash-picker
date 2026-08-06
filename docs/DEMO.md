# Demo card

**Reset first.** `npm run seed` - takes about 8 seconds and gives four clean
orders. Do it right before presenting, and do not leave a second tab picking
against the same sandbox while you demo.

---

## How scanning works

The barcode field is a plain text input and **that is the production design**,
not a stand-in. Store handhelds - Zebra, Honeywell - emulate a keyboard: they
type the digits into whatever is focused and send a carriage return. So typing
a barcode by hand does exactly what a real scanner does.

The field **autofocuses**, so it will capture your keystrokes. Type the digits
and press **Enter**, or click **Check**.

---

## Every barcode in the store

| Product | Barcode | Aisle / Bay / Shelf |
|---|---|---|
| Bananas Loose | `930000000011` | Produce / P1 / 2 |
| Chicken Breast Deli | `930000000028` | Deli / D1 / 1 |
| **Coca-Cola Classic 1.25L** | `930000001005` | **4 / B2 / 3** |
| **Diet Coke 1.25L** | `930000001012` | **4 / B2 / 3** |
| **Coke Zero Sugar 1.25L** | `930000001029` | **4 / B2 / 3** |
| Penne Pasta 500g | `930000002002` | 2 / B1 / 2 |
| Spiral Pasta 500g | `930000002019` | 2 / B1 / 2 |
| Basmati Rice 1kg | `930000002026` | 2 / B3 / 1 |
| Olive Oil 500ml | `930000002033` | 2 / B4 / 2 |
| Full Cream Milk 2L | `930000003009` | Chilled / C1 / 1 |
| Greek Yoghurt 1kg | `930000003016` | Chilled / C2 / 2 |
| Tasty Cheese 500g | `930000003023` | Chilled / C2 / 3 |
| Frozen Peas 1kg | `930000004003` | Frozen / F1 / 2 |
| Sourdough Loaf | `930000005006` | Bakery / K1 / 1 |

**The three colas share one shelf.** Same aisle, same bay, same shelf,
different barcodes. Location cannot tell them apart, which is exactly the
situation a picker is in.

---

## The run: FM-1003, Uber Eats

Three items, and each one demonstrates something different.

### Item 1 - Spiral Pasta 500g · aisle 2 / B1 / 2

Shows **0 on hand**. The customer pre-approved penne at checkout.

1. Tap **Penne Pasta 500g**
2. The gate resets, because what has to be in your hand has changed
3. Scan `930000002002`
4. Tap **Take Penne Pasta 500g**

> The scan verifies the **substitute**, not the thing that was out of stock.
> Penne goes in the tote, so penne is what gets checked.

### Item 2 - Basmati Rice 1kg · aisle 2 / B3 / 1

Use this one to show the **override**.

1. Tap **No barcode on the item**
2. It goes amber: *Recorded as unverified*
3. Tap **Picked**

> Labels get damaged. A gate with no escape is one a picker works around, and
> a workaround leaves no record at all. This writes `scan_override` to Nash.

### Item 3 - Coke Zero Sugar 1.25L · aisle 4 / B2 / 3

**This is the moment.** Kareem's own example.

1. Scan `930000001005` - Coca-Cola Classic, the bottle beside it

   ```
   ✗ WRONG ITEM
   That is Coca-Cola Classic 1.25L
   You need Coke Zero Sugar 1.25L
   ```

   The primary action stays disabled. You cannot record this pick.

2. Tap **Rescan**
3. Scan `930000001029` - verified
4. Tap **Picked all 2**

> It names what is in your hand. "Wrong item" is not actionable. "That is
> Coca-Cola Classic, you need Coke Zero" is.

### Then

- Finish the run, watch it write to Nash
- Back to the queue: FM-1003 is dimmed, `✓ Picked`, with its fill rate
- Open it again: **read-only**. `PATCH` replaces rather than merges, so
  re-picking would erase the record
- Go to **`/ops`**: fill rate by channel, plus **override rate** now that one
  was taken

---

## Where to show the route saving

**Not on FM-1003.** Its three items are already near-optimal, so the saving is
zero and the badge correctly does not appear.

**Use FM-1001** for the route story. Basket order was milk, pasta, peas,
cheese - out of the chiller and back for no reason. Sequenced it is aisle 2,
both chilled items together, then frozen last. Half the walking.

---

## If a scan will not clear

Every barcode above is in the sandbox. If one is rejected, it is being typed
into the wrong field or the seed has not run. `npm run seed`, reload, retry.

**Do not fight it on stage.** Tap **No barcode on the item**, take the
override, and carry on - that path is a designed part of the feature, not a
failure.
