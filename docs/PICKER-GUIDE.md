# Using OnePick

A guide for the person doing the picking.

OnePick puts every online order on one device, whatever channel it came from.
There is nothing to install, no separate app per marketplace, and no login to
remember. Open it and start the next order.

---

## What is on screen when you open it

**The queue.** Every order the store owes anyone, oldest first.

Each row shows the channel it came from, the order reference, the customer's
name, how many items are in it and where it is going.

```
  WEB        FM-1001
  Priya Nair
  4 items · Ipswich · $22.40
```

Orders that have already been picked show a green **✓ Picked** and the fill
rate instead, so you can see at a glance what is left to do.

The queue updates itself. New orders appear without you pulling to refresh,
including while you are looking at it.

**Tap any order to start picking it.**

---

## Walking a run

You get one item at a time. That is deliberate - the screen shows you the next
thing to put in the tote and nothing else.

### The route

At the top you will see the walking order for this run:

```
  ROUTE   Produce → Deli → 4        2 moves
```

The list has already been sorted into the order the store is actually walked,
not the order the customer added things to their basket. Chilled and frozen
items come last so they spend the least time out of temperature.

**Follow the order the app gives you.** Skipping ahead is allowed, but the route
is the shortest sensible walk for that trolley.

### Where the item is

Location comes first on the screen, before the product itself:

```
   AISLE          BAY          SHELF
  Produce          P1            2
```

Until you are standing in front of the shelf, nothing else on the screen
matters. If a product has no location recorded you will see *No location on
file*, which means you will need to find it the usual way.

### What to put in the tote

Below the location you get the picture, the product name and the quantity.

The picture is there for a reason. A lot of near-misses are lookalike packaging
rather than the wrong aisle, and the picture is the fastest way to catch that
before you scan.

If the system thinks the shelf is empty you will see **Shows 0 on hand**. That
is a warning, not an instruction. Check the shelf anyway, because stock counts
drift.

---

## Scanning

Before you can mark most items as picked, you scan them.

```
  SCAN TO CONFIRM
  [ Barcode                    ]  [ Check ]
  No barcode on the item
```

The field is already selected, so just scan. The handheld types the number in
and confirms it for you. You can also type the digits and press enter.

### If it is the right item

The box turns green, says **Barcode verified**, and the main button becomes
available. Tap it and you move to the next item.

### If it is the wrong item

```
  ✗ WRONG ITEM
  That is Coca-Cola Classic 1.25L
  You need Diet Coke 1.25L
```

The app tells you what you are holding and what you actually need. Put it back,
find the right one, tap **Rescan**.

This is the whole reason scanning exists. Three colas can sit on the same shelf
with almost the same label, and the location will never tell them apart.

### If you cannot scan it

Loose produce, a torn label, a barcode that will not read. Tap **No barcode on
the item** and carry on.

This is a normal part of the job and not something you need to avoid. It is
recorded so the store knows how often it happens, which is how the store finds
out a whole line has unreadable labels.

---

## Recording what actually happened

Four things can happen at the shelf, and there is a button for each.

### You got everything

Tap the big button at the bottom. It names what you are confirming, for example
**Picked 3** or **Picked 1kg**, so there is no ambiguity about the quantity
going in the tote.

### You got some, but not all

Tap **Found fewer** and set the number you actually have.

For anything sold by weight the button says **Enter weight** instead. Put the
item on the scale and type what it says, for example `0.94` for a 1kg order of
bananas.

**Enter the real number, not the one that was asked for.** The customer is
charged on what you weighed. A kilo order that comes out at 0.94kg is normal and
the app expects it.

### It is not on the shelf

Tap **Not on shelf**.

You do not need to scan first, for the obvious reason that there is nothing in
your hand to scan. Nothing else is required, and the run carries on.

### The customer approved a swap

If the customer chose a replacement when they ordered, it appears as its own
button with a picture:

```
  CUSTOMER APPROVED SUBSTITUTE
  Penne Pasta 500g                    ›
```

Tap it, then scan the replacement to confirm you have the right one. If more
than one alternative was approved they are listed in the customer's order of
preference, so take the first one that is on the shelf.

**You never choose the substitute yourself.** The customer made that decision
when they placed the order, with the whole range in front of them.

### The customer asked for a refund instead

Some customers say up front that they do not want a replacement:

```
  CUSTOMER PREFERENCE
  Refund if unavailable
  Do not substitute. They asked for their money back instead.
```

When you see this, no substitute is offered and none should go in the tote. If
the item is not there, tap **Not on shelf**. Putting something else in the bag
is worse than sending the order short, because they have already told you they
did not want it.

---

## Finishing the run

When the last item is done you get the summary:

```
  RUN COMPLETE
  98% fill
  2.94 of 3 units for Marcus Webb

  Bananas Loose          Partial   0.94/1
  Chicken Breast Deli    Picked    1/1
  Diet Coke 1.25L        Picked    1/1
```

Check it against the tote. This is the last point where a mistake is cheap to
fix.

Underneath, the app saves the run and confirms:

> **Saved to Nash** - Picking finished. Tote ready for handoff

That is picking done. Delivery is arranged separately and is not started by this
app, so the tote still needs to go where your store normally stages them.

Tap **Back to queue** and take the next order.

---

## Things worth knowing

| | |
|---|---|
| **You cannot lose a run** | Everything is saved as you go. If the screen locks, the battery dies or you close the tab, reopen the order and carry on |
| **Finished orders reopen read-only** | You can look at what was recorded, but you cannot change it. If something needs correcting, tell your supervisor rather than re-picking |
| **One picker per order** | Nothing stops two people opening the same order, so agree who has it before you start |
| **The fill rate is not a score** | It is what the customer receives against what they ordered. An out-of-stock item is a stock problem, not a picking mistake |

---

## Quick reference

| On the shelf | Tap |
|---|---|
| Got everything asked for | The main button - **Picked** |
| Got fewer than asked for | **Found fewer** |
| Sold by weight | **Enter weight**, then the number on the scale |
| Not there | **Not on shelf** |
| Not there, customer approved a swap | The **customer approved substitute** button |
| Not there, customer wants a refund | **Not on shelf** |
| Barcode will not scan | **No barcode on the item** |
| Scanned the wrong thing | **Rescan** |
