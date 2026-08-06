# Picker Lite - the brief, dissected

Source: `Picker Lite Exercise Interview.pdf`, Nash AI, 2026-08-06.

Everything below is **extracted, not interpreted**. Interpretation lives in `plan.md`.

---

## 1. What they asked for - four requirements, verbatim

| # | Requirement | Verbatim |
|---|---|---|
| **R1** | Fetch orders | *"Fetches orders to pick from Nash's sandbox API"* |
| **R2** | Guide the picker | *"Guides the picker through items - showing name, quantity, and location"* |
| **R3** | Handle scenarios | *"mark items picked, handle out-of-stock, substitutions, partial quantities"* |
| **R4** | Close the loop | *"Updates Nash when picking is complete"* |

**R3 is four separate states, not one.** Picked · out-of-stock · substituted · partial. Partial quantity is the one most easily missed - it is a *quantity* outcome, not a *status* outcome.

### The explicit invitation

> *"You can use any endpoint in the docs page. Or ask the interviewer if there's any internal functionality not exposed in the API."*

This is licence to ask for data that is not in the docs. **Use it for item location.**

---

## 2. Who the customer is

**FreshMart.** A grocery chain, **50 stores**, already using Nash for deliveries.

Their stated pain, verbatim:

| # | Pain | Verbatim |
|---|---|---|
| **P1** | Accuracy | *"We're having picking issues: accuracy…"* |
| **P2** | Speed | *"…speed…"* |
| **P3** | Substitutions | *"…and substitutions."* |
| **P4** | Fragmentation | *"Orders come from multiple channels managed on different systems. Our pickers juggle multiple screens"* |
| **P5** | No visibility | *"we have no unified view of fulfillment"* |

**P4 and P5 are described most vividly and are not in the four requirements.** That gap is deliberate - it is where judgement gets scored.

---

## 3. How it is judged, verbatim

| # | Criterion | Verbatim |
|---|---|---|
| **J1** | *"Speed to functional"* |
| **J2** | *"Ability to parse a new spec and make reasonable assumptions"* |
| **J3** | *"Prioritization under time pressure"* |
| **J4** | *"Communication range across technical and customer contexts"* |
| **J5** | *"Ownership of what you built and what you skipped"* |

**J5 makes the skip list a deliverable.** Not building something is only worth credit if it is named.

---

## 4. The presentation - two parts, two audiences

| Part | Length | Audience | Required content |
|---|---|---|---|
| **1. Customer** | 10-15 min | Business stakeholder, roleplayed as FreshMart | *"Demo the app and explain it to a business stakeholder"* |
| **2. Technical** | 15-20 min | Engineers | working demo · architecture and key decisions · **tradeoffs** · current state · **future state** · **next action items** |

**Total 25-35 minutes, not an hour.**

Part 2 lists six sections. **Use them as literal headings** - they handed over the structure, so do not invent one.

---

## 5. Resources

- Nash Sandbox account
- Nash API docs: https://docs.usenash.com/
- *"Feel free to reach out for any discussion or whiteboarding while you work."*

---

## 6. What the brief does NOT say

Recorded so predicted work gets cut rather than smuggled in.

| Not mentioned | Consequence |
|---|---|
| Zebra, or any device | Web is stated. **Do not defend the platform choice** - it was the brief's decision, not yours |
| Weight, heavy items, cold chain | The route/pack sequencing thesis is **unrequested**. Out unless location data makes it nearly free |
| Route optimisation or sequencing | *"location"* is **displayed**, not computed |
| Batch picking | Out |
| Auth, roles, multi-tenancy | Out. Hardcode the picker |
| Offline | Out as a build. **In as a stated NFR** |

**The four requirements are the contract. Everything else is optional and must be labelled as such.**
