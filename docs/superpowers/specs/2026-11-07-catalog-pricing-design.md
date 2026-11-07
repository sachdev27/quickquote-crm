# Catalog & pricing structure — design

Date: 2026-11-07 · Status: draft for approval

## Why

Products and prices grew piece by piece: rate groups `PE63 / PE80 / PE100 / SPRINKLER / FITTING / PLB` mix
"grade" and "product type", PLB has one rate for all grades, DWC has no home, and weights for anything but HDPE
pipe are hard-coded or typed per product. The owner wants one systematic model: a product family tree, a price
for every family × grade, editable weight tables for new product types, and the generated drawings on quotes
kept and extended.

## Goals

1. **Catalog tree:** Parent group → Subcategory → Grade → Product.
   - Parents: **HDPE**, **Fittings**, **Irrigation accessories**, **PVC / other plastics**.
   - HDPE subcategories: **HDPE Pipe** (PE 63/80/100), **Sprinkler** (PE 63/80), **PLB duct** (PE 63/80/100),
     **DWC** (PE 80/100). Each subcategory declares its own allowed grades.
   - Fittings: today's fitting families move under the Fittings parent.
   - Irrigation accessories and PVC start empty; the user adds subcategories later from the UI.
2. **Pricing: one rate per subcategory × grade** (owner's call: "separate per subcategory"), still per
   preset and per rate profile as today. PLB PE 80 is fully independent of HDPE Pipe PE 80.
3. **Price method per subcategory**, so new product types can price differently:
   - `weight_rate` (default): unit price = kg/m × ₹/kg of the subcategory × grade rate.
   - `sprinkler_piece`: today's sprinkler formula (raw × piece weight + flat production/coupler/margin).
   - `fixed`: a base ₹ per unit typed on the product, plus the subcategory's per-preset margin
     (bought-in fittings, accessories).
4. **Weight method per subcategory:**
   - `is4984`: weight from grade + PN + OD using the built-in IS 4984 chart/formula (today's HDPE logic).
     Used by **HDPE Pipe and PLB duct** (owner: "for now use PLB as same as HDPE").
   - `matrix`: an **editable weight matrix** — sizes down the side, a class axis across the top (e.g. SN4/SN8/SN16
     for DWC), kg/m in each cell, optional OD / ID / wall per row. Used by **DWC** and any future subcategory.
     Rows and class columns can be added, edited and removed; CSV import/export.
   - `brand`: sprinkler's existing per-brand piece weights (unchanged).
   - `none`: weight not used (fixed-price items).
5. **Drawings on the quotation** stay generated (the current cross-section showing OD, ID, thickness):
   - Each subcategory picks a drawing: `pipe` (existing), `sprinkler` (existing), `fitting` (existing),
     `dwc` (new: corrugated ring, labelled ID, OD, SN), `none`.
   - PLB: the ring wall is drawn in the product's **Colour** spec and the colour name is printed with the dims.
6. **One management screen** (extends today's category manager): tree on the left (parent → subcategory),
   detail on the right with name, unit, GST, HSN default, allowed grades, price method, weight method, drawing,
   spec fields, and — depending on methods — the rate grid and/or weight matrix.
7. **Rates grid:** per preset, rows = subcategories, columns = their grades; each cell edits raw / production /
   transport / margin as today.

## Non-goals

- PLB per TEC GR/CDS-008 (OD/ID sizing) or IS 16205 duty codes — later, if needed; the `matrix` method covers it.
- Uploading product photos (owner wants it "later"). Design leaves room: a nullable image field on subcategory
  and product that, when set, replaces the drawing. Not built in this round.
- Overriding individual cells of the IS 4984 chart.
- Changing invoices, quote numbering, or saved quotes.

## Anti-goals (failure even if it works)

- **Saved quotes change price.** Lines already store unit price; nothing in this change may re-price them.
- **Quoting gets slower.** The quote picker, AI Quote matching and price list must keep working with the same
  speed and search; the tree is for organising, not extra clicks per line.
- Losing any current rate value during migration.

## Constraints

- Stack as is: TanStack Start, drizzle over Cloudflare D1, migrations in `migrations/` (next is `0023`).
  SQLite cannot alter CHECKs/drop columns easily — rebuild tables if needed.
- Category registration (`registerCategories` in `_authenticated/route.tsx`, `CATEGORY_LABELS`,
  `categoryDefaults`) is how the client knows categories; extend it rather than replace it.
- `products.category` stays the subcategory id (`pipe`, `sprinkler`, `plb`, `fitting`, …) so existing quotes,
  AI matching and search keep working. Ids are not renamed.
- tsconfig: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.

## Data model (decided)

- New `product_groups` (id, label, sort). Seed `hdpe`, `fittings`, `irrigation`, `pvc`.
- `categories` gains: `parent_id`, `grades` (comma list, empty = no grade), `price_method`, `weight_method`,
  `drawing`, `class_label` (e.g. "PN", "SN"). Existing `rate_group_id` becomes unused for graded subcategories.
- **Rate groups become `<category>:<grade>`** (e.g. `pipe:PE80`, `plb:PE100`, `dwc:PE80`); ungraded
  subcategories use `<category>`. A product's `rate_group_id` is derived from its category + grade and kept in
  the column for existing queries.
- New `weight_matrix` (category_id, grade nullable = all grades, size_mm, size_label, class, kg_per_m,
  od_mm, id_mm, wall_mm). Matrix cells generate/update products ("Sync products" — upsert one product per
  filled cell × allowed grade, deactivate products whose cell was cleared; never delete, quotes reference them).

## Migration (decided)

- `pipe:PE63/80/100` ← current `PE63/PE80/PE100` rates.
- `sprinkler:PE63/PE80` ← current `SPRINKLER` rates (same values for both).
- `plb:PE63/80/100` ← current `PLB` rates (same values for all three; owner adjusts).
- `fitting` ← current `FITTING`. `dwc:PE80/100` ← zeros.
- brand_raw rows copied the same way. Every product's `rate_group_id` rewritten from category + grade.
- Old groups kept until a later cleanup, so a rollback is a deploy, not a data restore.

### Owner's answers (after review)

- **Existing sprinkler products** (7, no grade today): duplicate each into a **PE 63** and a **PE 80** product.
  The original row becomes PE 63 (keeps its id, so old quotes still point at it); a copy is added as PE 80.
- **Fixed price method:** one base ₹ per product (new `products.base_price` column) **plus a per-preset margin**
  for the subcategory. Fixed subcategories have one rates-grid row per preset holding only margin (% or ₹);
  unit price = base_price × (1 + margin%) or base_price + margin₹. Quote line: `weight_kg` = 0, unit price stored.

### Builder's calls (made while writing; owner may override)

- **Pricing reads `price_method` from the product's category**, not from group ids. `rateKgFor`, product
  fields, price playground, price list and bulk HSN stop testing literal ids (`SPRINKLER`, `FITTING`, `PE63`…);
  categories are already loaded server-side and registered on the client, so both sides can look it up.
- **Fittings are ungraded.** Their `grade` column keeps holding the family (Electrofusion, Spigot moulded, …),
  as today; `grades` is empty for the fitting subcategory, rate group stays `fitting`. Fittings switch to the
  `fixed` price method only when the owner sets it.
- **Class lives in the existing `pn` column** (e.g. "PN 6", "SN 8"), shown with the category's `class_label`.
  Search and AI matching keep working unchanged.
- **Matrix sync key** = (category, grade, size_mm, class). A hand-made product that matches a cell is adopted,
  not duplicated. Editing a row's size updates its products rather than creating new ones.
- **Shrinking a subcategory's grades** is blocked while products or non-zero rates use that grade; moving a
  subcategory to another parent is free. Deleting a subcategory stays blocked while it has products (as today).
- **Rollback** after the new rates were edited would show the old values from before migration; acceptable,
  because old groups are only a safety net and are removed in a later cleanup.

## Rollout order (suggested)

1. Data model + migration + derived rate groups (pricing unchanged in effect).
2. Manager screen: tree, methods, rates grid.
3. Weight matrix editor + DWC + product sync.
4. Drawings: PLB colour, DWC drawing.
5. Price list + quote picker grouped by parent → subcategory → grade.

## Left to the builder

- Exact UI layout of the manager, matrix editor and rates grid (must stay a horizontal, enterprise-style
  master-detail; the owner rejected a stacked vertical form before).
- DWC drawing look; CSV column format for the matrix.
- How the price list prints DWC (one table per grade, sizes × SN suggested).
- Test coverage: migration verified against a copy of production data with sqlite3; unit tests for price and
  weight methods.

Separate from this design: the Gmail picker now defaults to "whole inbox" (one-line change, shipped on its own).
