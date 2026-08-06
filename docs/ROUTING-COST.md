# Why routing is the number that matters

The customer-facing argument for the sequencing algorithm. One page.

---

## 1. A picker's shift is four things, and only one of them is waste

| | What it is | Can software remove it? |
|---|---|---|
| **Walking** | Crossing the store between items | **Yes, entirely, today** |
| Searching | Finding the item once you are at the bay | Partly - better location data |
| Handling | Reaching, weighing, placing in the tote | No. This is the actual work |
| Exceptions | Out of stock, substitutions, damaged labels | Partly - policy, not routing |

Handling is the job. Searching and exceptions are reducible but never zero.

**Walking is the only component that delivers nothing to the customer.** No
shopper has ever received a better order because the picker walked further. It
is pure cost, and it is the one line a piece of software can attack without
moving a shelf, hiring anyone, or changing a single physical process.

That is the whole argument for spending the algorithm budget here first.

---

## 2. The counterfactual has to be honest

The comparison is against **basket order** - the sequence the customer happened
to add things to their cart in. Milk, pasta, peas, cheese: out of the chiller,
across to dry goods, into the freezer, back to the chiller.

That is not a strawman. It is exactly what a store with no picking system does,
because the order arrives as a list and a list gets worked top to bottom.

---

## 3. The number, on the four real orders in the sandbox

```
Basket order                    224 s of walking
Sequenced  (shipped today)      160 s          -29%
Batched wave  (designed)        124 s          -45% cumulative
```

Per item picked:

```
17.2 s  ->  12.3 s  ->  9.5 s
            ^shipped     ^designed
```

**Sequencing alone removes 4.9 seconds per item, and it is running in
production right now.** Batching removes another 2.8 on top, and the batching
figure already has put-to-tote sortation deducted.

Same `travel()` function computes all three, so the roadmap number and the
operations report can never drift apart.

---

## 4. The unit this converts into

> *Every one second saved per item, they save ten million dollars a year.*
> - Kareem, on Coles-scale grocery

That is the unit. **7.7 seconds per item** is what the two algorithms remove
between them.

Deliberately not multiplied out. n = 4 orders is a demonstration of method, not
a study, and a number that large deserves a real order book behind it before
anybody says it in a meeting. The mechanism and the unit are the claim; the
annual figure is a pilot's job.

---

## 5. Why this is the right first algorithm

It is not the most sophisticated thing available. It is the one with the best
ratio of value to fragility:

- **No new hardware.** No indoor positioning, no sensors, no shelf tags
- **No process change.** Pickers already walk aisles and work a list
- **Config, not intelligence.** A store's aisle order is physically fixed, so
  it is data the store already has
- **Degrades safely.** An aisle the layout does not recognise sorts to the
  *end* of the run rather than being guessed at, which reads to the picker as
  "find this one yourself" instead of sending them confidently to a wrong bay
- **Measurable on day one.** The saving is computed per run against basket
  order, so a pilot proves itself from its own data rather than from a
  vendor's benchmark

And the honest limit, stated before anyone finds it: **the algorithm is only as
good as the location data.** Sequencing on a stale planogram is worse than no
sequencing, because the picker trusts it. That is why a planogram feed is R1 on
the roadmap and not an afterthought.

---

## 6. What the saving buys

Reported on `/ops` as a shift total rather than per run, because per run it is
noise a picker cannot act on. Summed across a shift it becomes a budget line:
hours the store did not spend walking.

Which is the sentence that matters commercially - it is not a productivity
metric, it is **capacity the store already paid for and was not getting.**
