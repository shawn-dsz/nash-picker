# Pick sequencing

**The problem:** a picker walks the store in whatever order the customer added
things to their basket. Milk, then pasta, then back to the freezer, then back
to the chiller. Nobody designed that route. It is an accident of how someone
shopped online.

**What this does:** reorders the pick list into the order the store is actually
walked.

---

## The algorithm: serpentine routing

Also called **S-shape** or **boustrophedon** routing. It is the standard
heuristic for warehouse order picking, and in plain English it is this:

> Walk the store front to back. In each aisle you need something from, go all
> the way down it, picking as you go. Then turn into the next aisle and walk
> back the other way. Never walk an aisle you do not need.

The name comes from ploughing. You do not return to the start of the field
after every furrow, you turn around and plough the next one back the other way.

```
        AISLE 1     AISLE 2     AISLE 3     AISLE 4
        │           │           │           │
START ──┼───────┐   ┌───────────┼───────┐   │
        │       │   │           │       │   │
        │   ●   │   │   ●       │       │   │
        │       │   │           │   ●   │   │
        │   ●   │   │       ●   │       │   │
        │       │   │           │       │   │
        └───────┘   └───────────┘       └───┘ ── END
         down        up          down

        ● = an item to pick
```

Compare that to walking in basket order, where the same four items might send
you down aisle 3, back to aisle 1, out to aisle 4, and back to aisle 2.

---

## The two halves, and why the distinction matters

Sequencing needs an algorithm **and** a piece of data, and they are different
kinds of thing.

| | What it is | Where it comes from |
|---|---|---|
| **The traversal** | Serpentine. Real algorithm, in `lib/sequence.ts` | Written once, works for any store |
| **The aisle order** | Which aisle physically comes after which | **The store.** It cannot be derived |

**Why the aisle order cannot be computed.** The values in a real catalog are a
mix: `"2"`, `"4"`, `"Produce"`, `"Chilled"`, `"Frozen"`, `"Bakery"`, `"Deli"`.
There is no comparison that puts those in walking order, because walking order
is a fact about a building. Two FreshMart stores can stock identical products
and have completely different floorplans.

So the algorithm is **parameterised by the store's layout**, and the layout is
data the store already has. In this build it is a constant. In production it
comes from the planogram feed, which is the first item in the architecture's
next actions.

---

## The walk order is not shortest-first

The Carlton order is:

```
Produce → Bakery → Deli → Aisle 1..5 → Chilled → Frozen
```

Ambient goods first. Chilled second last. **Frozen always last.**

**The reason is cold chain, not distance.** A tub of ice cream picked first
sits in a tote for the length of the run. Optimising purely for walking
distance gives you a shorter route and warmer frozen goods, which is a worse
outcome for the customer and a compliance problem for the store.

This is the part that would be wrong if you treated it as a pure
shortest-path problem. **The constraint is temperature, and it dominates.**

---

## What it does not do, and why

Serpentine is a heuristic. There are better routes available.

| Alternative | What it does | Why not this |
|---|---|---|
| **Return routing** | Enter and leave each aisle from the same end | Strictly worse than serpentine for dense picks |
| **Largest gap** | Skip the biggest empty stretch in each aisle | Better when picks are sparse, worse when dense. Not worth the variance |
| **Midpoint** | Split each aisle at the halfway point | Same tradeoff, same reason |
| **Ratliff-Rosenthal** | The provably **optimal** route. Solvable exactly for a rectangular warehouse | Around 10% better than serpentine, and it is the wrong choice here |

**Why not the optimal one.** Optimal routes look wrong to a human. They skip an
aisle and double back later, and there is real evidence from warehouse
operations that pickers stop trusting a route that behaves like that, then
start ignoring it. **A predictable route that gets followed beats an optimal
route that gets abandoned.**

Serpentine captures most of the available gain, and a picker can see at a
glance that it makes sense.

---

## Two bugs this avoids

**1. `B10` sorting before `B2`.** Bays are strings. A default string sort puts
`"B10"` before `"B2"`, so the picker walks past bay 10, goes to bay 2, and
comes back. The comparison uses natural ordering, which reads the digits as
numbers.

**2. Guessing at an unknown aisle.** If a product's aisle is not in the store's
layout, it goes to the **end** of the run rather than being slotted somewhere
plausible.

That second one matters more than it looks. **Sequencing on stale location data
sends the picker confidently to the wrong bay**, and confidently is the
problem: they trust the route, so they look harder in the wrong place before
giving up. Nothing in this system currently tells you when a bay has moved,
which is exactly why location freshness has to be solved before sequencing is
trusted at scale.

---

## What it actually saved

Measured against the four seeded orders, comparing basket order to sequenced
order. Travel is counted in aisle positions moved through the layout.

| Order | Basket order | Sequenced | Saved |
|---|---|---|---|
| **FM-1001** | 3 moves, 10 travel | 2 moves, **5 travel** | **50% less travel** |
| **FM-1002** | 2 moves, 6 travel | 2 moves, 6 travel | no gain |
| **FM-1003** | 1 move, 2 travel | 1 move, 2 travel | no gain |
| **FM-1004** | 2 moves, 10 travel | 2 moves, **7 travel** | **30% less travel** |

**Two of four gained. Two did not, and the app reports zero rather than
inventing a number.**

That is the honest result and it is worth stating plainly: on a three or four
item basket there often is not much to optimise, because the picker is
crossing the store either way. **The gain scales with basket size**, and a real
grocery basket is twenty to forty lines, not four.

FM-1001 shows the shape of it. In basket order the picker went pasta, cheese,
milk, peas: aisle 2, chilled, chilled, frozen, with a needless bounce out of
the chiller and back. Sequenced, they do aisle 2, both chilled items together,
then frozen last. **Same four items, half the walking.**

### Why travel is measured in aisle positions, not metres

Real distance needs aisle lengths and cross-aisle geometry, which is planogram
data this system does not have. Aisle positions are a proxy that is honest
about its own precision, and they still capture the thing that costs time:
crossing the store rather than moving along a shelf.

---

## Where it lives

| | |
|---|---|
| `lib/sequence.ts` | The algorithm, the store layout, and the measurement |
| `lib/adapter.ts` | Calls `sequence()` on the joined rows before they reach the view |
| The pick screen | Shows the route as a banner: `Produce → Deli → 4 · 2 moves` |

The route banner exists because **a picker who does not know the list is
sequenced will assume it is basket order and second-guess it.** An
optimisation nobody is told about gets worked around.

---

## What would make this materially better

1. **A planogram feed.** Real aisle order per store, and a signal when a bay
   moves. Everything else here is blocked on this.
2. **Batch picking.** Sequencing one order saves a fraction of one walk.
   Sequencing four orders into a single trip is the actual throughput lever,
   and it is a different and harder problem: tote assignment and mis-sort risk.
3. **Measured pick times per aisle.** The layout constant assumes every aisle
   move costs the same. It does not. Real timings would let the ordering
   reflect the store rather than a straight line.
