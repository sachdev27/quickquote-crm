# Catalog & Pricing Structure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the catalog into Parent → Subcategory → Grade → Product, with one rate per subcategory × grade, per-subcategory price/weight methods, an editable weight matrix (DWC), and drawings per subcategory.

**Architecture:** Categories (= subcategories) gain parent, grades and method columns; rate groups become `<category>:<grade>` and every pricing call derives the method from the group's category instead of literal ids like `SPRINKLER`. A new `src/lib/pricing.ts` owns that logic so call sites barely change. Weight matrix cells sync into ordinary `products` rows, so quotes, search and AI matching keep working.

**Tech Stack:** TanStack Start (createServerFn), React Query, drizzle-orm over Cloudflare D1 (SQLite), vitest, Tailwind.

**Spec:** `docs/superpowers/specs/2026-11-07-catalog-pricing-design.md`

## Global Constraints

- Saved quotes must never change price; nothing re-prices `quote_items`.
- `products.category` ids (`pipe`, `sprinkler`, `fitting`, `plb`, …) are never renamed.
- No current rate value may be lost; old rate groups (`PE63`, `PE80`, `PE100`, `SPRINKLER`, `FITTING`, `PLB`) stay in the DB after migration.
- Next migration file is `migrations/0023_…`. SQLite: add columns with `alter table … add column`; no table rebuild needed here.
- tsconfig: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` (use `!`, `??`, conditional spread).
- Wrangler needs Node ≥ 22: prefix commands with `PATH=/opt/homebrew/opt/node/bin:$PATH`.
- Manager UI must be horizontal master-detail (owner rejected stacked vertical forms).
- Parents seeded: `hdpe` HDPE, `fittings` Fittings, `irrigation` Irrigation accessories, `pvc` PVC / other plastics.
- Grades: pipe `PE63,PE80,PE100`; sprinkler `PE63,PE80`; plb `PE63,PE80,PE100`; dwc `PE80,PE100`; fitting `` (none).
- Methods: pipe `weight_rate`/`is4984`/`pipe`; plb `weight_rate`/`is4984`/`pipe`; sprinkler `sprinkler_piece`/`brand`/`pipe`; dwc `weight_rate`/`matrix`/`dwc` with `class_label` `SN`; fitting `fixed`/`none`/`fitting`. pipe and plb `class_label` `PN`.

## Review Focus

1. **Quote picker after migration** — adding a PE 80 HDPE pipe or a sprinkler on New Quote prices identically to before migration (same preset, same profile). Test in Task 1 (`rateKgFor` parity) + manual check in Task 9.
2. **Product with grade not in its category's list** (e.g. legacy pipe with null grade) — `groupIdFor` falls back to the category id, never throws; product still lists with price 0 and is visible. Test in Task 1.
3. **Brand raw override on new groups** — a brand's own raw ₹/kg still applies after rename (brand_raw copied). Checked by SQL in Task 2.
4. **New category created from the manager** — gets rate rows for every profile × preset × grade, so its prices are editable immediately. Test via `rateRowsFor` in Task 3.
5. **Matrix row edit** — changing a size updates existing products, never duplicates; clearing a cell deactivates, never deletes. Tests in Task 6.

---

### Task 0: Ship the Gmail "whole inbox" default on its own

**Files:** Modify: `src/components/gmail-inbox.tsx:29` (already changed locally: `useState(true)`)

- [ ] **Step 1:** Branch `fix/gmail-whole-inbox`, commit `fix(ai-quote): Gmail picker defaults to whole inbox`, push, PR, merge after CI. (Separate from the rest of this plan.)

---

### Task 1: Pricing core library

**Files:**
- Create: `src/lib/pricing.ts`
- Modify: `src/lib/quote.ts:9-46` (register new category fields), `src/lib/quote.ts:104-117` (sprinkler helpers move behind method)
- Test: `src/test/pricing.test.ts`

**Interfaces:**
- Produces (all exported from `src/lib/pricing.ts`):
  - `type PriceMethod = "weight_rate" | "sprinkler_piece" | "fixed"`
  - `type WeightMethod = "is4984" | "matrix" | "brand" | "none"`
  - `type Drawing = "pipe" | "sprinkler" | "fitting" | "dwc" | "none"`
  - `groupIdFor(category: string, grade: string | null): string` → `"pipe:PE80"`; category has no grades or grade not in its list → `category`
  - `categoryOfGroup(groupId: string): string` → part before `:`; legacy ids map `PE63|PE80|PE100→pipe`, `SPRINKLER→sprinkler`, `FITTING→fitting`, `PLB→plb`, else lower-cased id
  - `priceMethodOf(groupId: string): PriceMethod` (reads registered category; default `weight_rate`)
  - `isPieceGroup(groupId: string): boolean` = `priceMethodOf(g) === "sprinkler_piece"` — replaces every `=== SPRINKLER_GROUP`
  - `rateKgFor(r: Rate, group: string, weightKg: number, nonIsi?: boolean): number` (moved here; quote.ts re-exports)
  - `fixedPrice(r: Rate, basePrice: number): number` = `margin_is_pct ? base × (1 + margin/100) : base + margin`
  - `unitPriceFor(p: { rate_group_id: string; weight_kg: number; base_price: number | null }, r: Rate | undefined, nonIsi?: boolean): number`
- `registerCategories` rows gain `parent_id, grades, price_method, weight_method, drawing, class_label`; `categoryDefaults(c)` returns them too as `{ …, parent: string | null, grades: string[], priceMethod, weightMethod, drawing, classLabel: string }`.

- [ ] **Step 1: Write failing tests** in `src/test/pricing.test.ts` (call `registerCategories` in `beforeEach` with pipe/sprinkler/plb/dwc/fitting rows using the Global Constraints values):
  - `groupIdFor("pipe","PE80") === "pipe:PE80"`; `groupIdFor("pipe",null) === "pipe"`; `groupIdFor("fitting","Electrofusion") === "fitting"`; `groupIdFor("pipe","PE999") === "pipe"`
  - `categoryOfGroup("plb:PE63") === "plb"`; `categoryOfGroup("SPRINKLER") === "sprinkler"`; `categoryOfGroup("PE100") === "pipe"`
  - `isPieceGroup("sprinkler:PE63") === true`; `isPieceGroup("pipe:PE63") === false`
  - parity: for rate `{raw_kg:100,production_kg:10,transport_kg:5,margin:10,margin_is_pct:1}`, `rateKgFor(r,"pipe:PE80",0.5)` equals old `ratePerKg(r)`; `rateKgFor(r,"sprinkler:PE63",2)` equals old `sprinklerRateKg(r,2)`
  - `fixedPrice({…margin:20,margin_is_pct:1}, 100) === 120`; flat margin 15 → `115`
  - `unitPriceFor({rate_group_id:"fitting",weight_kg:0,base_price:100}, r20pct) === 120`; `unitPriceFor({rate_group_id:"pipe:PE80",weight_kg:0.5,base_price:null}, r) === 0.5 × ratePerKg(r)`; rate undefined → `0`
- [ ] **Step 2:** Run `npx vitest run src/test/pricing.test.ts` → FAIL (module not found).
- [ ] **Step 3:** Implement `src/lib/pricing.ts` (imports `Rate`, `ratePerKg`, `sprinklerPrice`, `categoryDefaults` from `quote.ts`; `quote.ts` never imports pricing). Extend `registerCategories`/`categoryDefaults`. Delete `rateKgFor` from `quote.ts` and point its importers (`price-playground.tsx`, `products.tsx`) at `@/lib/pricing`.
- [ ] **Step 4:** `npx vitest run` → all PASS; `npx tsc --noEmit` clean.
- [ ] **Step 5:** Commit `feat(pricing): method-based pricing helpers`.

---

### Task 2: Migration 0023 + schema

**Files:**
- Create: `migrations/0023_catalog_tree.sql`
- Modify: `src/data/schema.ts` (new `product_groups`, `weight_matrix`; `categories` + `products` columns)

**Interfaces:**
- Produces tables/columns:
  - `product_groups(id text pk, label text not null, sort integer not null default 0)`
  - `categories` + `parent_id text`, `grades text not null default ''`, `price_method text not null default 'weight_rate'`, `weight_method text not null default 'none'`, `drawing text not null default 'none'`, `class_label text not null default ''`
  - `products` + `base_price real`
  - `weight_matrix(id text pk, category_id text not null, grade text, size_mm real not null, size_label text not null, class text not null, kg_per_m real not null default 0, od_mm real, id_mm real, wall_mm real, sort integer not null default 0)`, unique index on `(category_id, coalesce(grade,''), size_label, class)`

SQL steps (in this order, one file):
1. Create `product_groups`, seed 4 parents (sort 1–4).
2. Add category columns; set values per Global Constraints; `insert or ignore` category `dwc` (label `DWC Pipe`, unit `m`, gst 18, parent `hdpe`, spec_fields `Colour`). Parents: pipe/sprinkler/plb/dwc → `hdpe`, fitting → `fittings`; any other existing category → `hdpe` if unit = `m` else `fittings`.
3. Add `products.base_price`.
4. Insert rate groups: `pipe:PE63` "HDPE Pipe PE 63" etc. for every (category, grade); `fitting` "Fitting".
5. Copy rates: `insert or ignore into rates (…) select profile_id, preset_id, 'pipe:PE63', raw_kg, raw_kg_non_isi, production_kg, transport_kg, margin, margin_is_pct from rates where group_id='PE63'` — same for PE80/PE100; `sprinkler:PE63` and `sprinkler:PE80` from `SPRINKLER`; `plb:PE63/80/100` from `PLB`; `fitting` from `FITTING`; `dwc:PE80/PE100` zero rows for every profile × preset (fitting too if `FITTING` had none).
6. Same copies for `brand_raw`.
7. Duplicate sprinkler products: `insert into products (id, …, grade, rate_group_id) select lower(hex(randomblob(16))), …, 'PE80', 'sprinkler:PE80' from products where category='sprinkler'`; then `update products set grade='PE63' where category='sprinkler' and (grade is null or grade='')` (originals keep their ids).
8. Rewrite `products.rate_group_id`: `category || ':' || grade` where grade is in that category's `grades` list (`instr(','||c.grades||',', ','||p.grade||',') > 0`), else `category`.
9. `update categories set rate_group_id = null` for graded categories (no longer used); fitting → `fitting`.

- [ ] **Step 1:** Write the migration + schema changes.
- [ ] **Step 2:** Verify on a copy of the local DB: `cp <local .sqlite> scratch/test.sqlite && sqlite3 scratch/test.sqlite < migrations/0023_catalog_tree.sql`, then:
  - `select group_id, count(*) from rates group by 1` → each new group has the same row count as its source
  - `select count(*) from rates n join rates o on o.profile_id=n.profile_id and o.preset_id=n.preset_id and o.group_id='PE80' where n.group_id='pipe:PE80' and (n.raw_kg<>o.raw_kg or n.margin<>o.margin)` → `0`
  - `select category, grade, rate_group_id, count(*) from products group by 1,2,3` → sprinkler rows doubled (PE63 + PE80), pipes `pipe:PEx`, fittings `fitting`
  - brand_raw counts per new group equal source counts
- [ ] **Step 3:** `PATH=/opt/homebrew/opt/node/bin:$PATH npx wrangler d1 migrations apply DB --local` → applied.
- [ ] **Step 4:** Commit `feat(db): catalog tree, per-grade rate groups, weight matrix`.

---

### Task 3: Category & product server API

**Files:**
- Modify: `src/data/api.ts:538-631` (categories), `:642` (saveProduct), `:270-295` (listPricing)
- Create: `src/lib/category-rules.ts`
- Test: `src/test/category-rules.test.ts`

**Interfaces:**
- Consumes: `groupIdFor` (Task 1).
- Produces:
  - `src/lib/category-rules.ts`: `rateRowsFor(categoryId: string, grades: string[], profiles: string[], presets: string[]): { profile_id; preset_id; group_id }[]` (grades empty → one group = categoryId); `removedGradesInUse(oldGrades: string[], newGrades: string[], used: { grade: string | null }[]): string[]`
  - `listCategories` → `{ groups: product_groups[], categories: categories[] }` (update `_authenticated/route.tsx` loader + `Shell` to register `categories`)
  - `saveCategory` input adds `parent_id: string`, `grades: string[]`, `price_method`, `weight_method`, `drawing`, `class_label`; on create/edit inserts missing `rate_groups` + `rates` rows via `rateRowsFor` (`insert or ignore`); rejects with `"Grade PE63 still has products"` when `removedGradesInUse` non-empty
  - `saveProductGroup({ id?: string; label: string })`, `deleteProductGroup({ id })` (blocked while categories point at it) — adminOnly
  - `saveProduct`: server sets `rate_group_id = groupIdFor(category, grade)` (ignores client value); accepts `base_price: number | null`
  - `listPricing`: drop the `FITTING` filter; return all groups (fixed-method groups carry only margin)

- [ ] **Step 1: Failing tests** in `category-rules.test.ts`: `rateRowsFor("dwc",["PE80","PE100"],["p1"],["s1","s2"])` has length 4 and contains `{profile_id:"p1",preset_id:"s2",group_id:"dwc:PE100"}`; `rateRowsFor("acc",[],["p1"],["s1"])` → `[{…group_id:"acc"}]`; `removedGradesInUse(["PE63","PE80"],["PE80"],[{grade:"PE63"}]) → ["PE63"]`; `removedGradesInUse(["PE63"],[],[{grade:"PE80"}]) → []`.
- [ ] **Step 2:** `npx vitest run src/test/category-rules.test.ts` → FAIL.
- [ ] **Step 3:** Implement rules + API changes; grade check also counts non-zero `rates` rows for the removed grade's group as "in use".
- [ ] **Step 4:** Tests PASS; `npx tsc --noEmit` clean.
- [ ] **Step 5:** Commit `feat(api): category tree, grades and methods`.

---

### Task 4: Replace hard-coded group ids at call sites

**Files (each line from the current grep):**
- `src/components/category-manager.tsx:26,142,307` — drop `SHARED_GROUPS`; rate editing moves to Task 5 grid
- `src/components/product-fields.tsx:260` — `isPieceGroup(prod.rate_group_id)`; grade `<select>` from `categoryDefaults(cat).grades` (free text only when list empty); show `base_price` input when `priceMethod === "fixed"`, hide weight when `weightMethod` is `none`
- `src/data/api.ts:355` — SQL `case when rates.group_id like 'sprinkler%' or group_id = 'SPRINKLER'` → compute in JS: skip groups where `isPieceGroup`
- `src/routes/_authenticated/new-quote.tsx:50,105,1692-1793,1973,2297,2753` — `SPRINKLER_GROUP` comparisons → `isPieceGroup(c.id)`; line 1973 sprinkler rate lookup uses the product's own `rate_group_id`; `card: "FITTING"` → `"fitting"`; catalog add uses `unitPriceFor` for fixed groups (line price = base_price route, `weightKg` 0)
- `src/routes/_authenticated/products.tsx:64-66,240,260-262,425-427,641,1207-1222,1307-1309,1430,2474,3169,3593` — same swaps; new fitting rows `rate_group_id: "fitting"`; sprinkler import rows `groupIdFor("sprinkler", grade)`
- `src/routes/_authenticated/price-list.tsx:86-88` and `src/components/price-playground.tsx:29-35,129` — `isPieceGroup`; `rateKgFor` import from `@/lib/pricing`
- `src/lib/quote.ts:107` — delete `SPRINKLER_GROUP` once no importers remain

- [ ] **Step 1:** `grep -rnE "SPRINKLER_GROUP|\"SPRINKLER\"|\"FITTING\"|SHARED_GROUPS" src` lists only test files and migration-era comments when done.
- [ ] **Step 2:** `npx tsc --noEmit && npx vitest run && npx eslint src` → clean.
- [ ] **Step 3:** Local dev (`./dev.sh`): New Quote → add HDPE PE80 63 mm PN6 and a sprinkler with the same preset as before migration; prices match a screenshot taken before Task 2 (Review Focus 1).
- [ ] **Step 4:** Commit `refactor(pricing): method-based group checks`.

---

### Task 5: Catalog manager UI (tree + detail + rates grid)

**Files:**
- Rewrite: `src/components/category-manager.tsx`
- Create: `src/components/rates-grid.tsx`

**Interfaces:**
- Consumes: `listCategories`, `saveCategory`, `deleteCategory`, `saveProductGroup`, `deleteProductGroup` (Task 3); `listPricing` + the existing rate save server fn used by new-quote/products.
- Produces: `<CategoryManager />` (same export, same trigger button in products.tsx); `<RatesGrid presetId categoryIds? />` reusable.

Layout: left column = tree (parents with add/rename/delete, subcategories under each with add); right = detail with a top row of fields (Name, Parent, Sold per, GST, Class label), a row of method selects (Price method, Weight method, Drawing), grade chips (PE63/PE80/PE100 + custom), spec fields input, then `RatesGrid` filtered to this subcategory. A separate "All rates" tab shows `RatesGrid` for all: rows = subcategory, columns = grade, cell click opens raw / non-ISI raw / production / transport / margin (+ %/₹ toggle). Fixed-method rows show only margin. Sprinkler rows label production/transport as "Production ₹/pc" / "Coupler ₹/pc".

- [ ] **Step 1:** Build it; Escape/X closes.
- [ ] **Step 2:** `npx tsc --noEmit && npx eslint src` clean.
- [ ] **Step 3:** In browser: create "Test Acc" under Irrigation accessories, price method fixed → rates grid shows margin cells for every preset; add grade PE63 to DWC then remove it → allowed; try removing PE80 from pipe → blocked with message. Delete "Test Acc".
- [ ] **Step 4:** Commit `feat(catalog): tree manager and rates grid`.

---

### Task 6: Weight matrix (DWC and future subcategories)

**Files:**
- Create: `src/lib/matrix-sync.ts`, `src/components/weight-matrix.tsx`
- Modify: `src/data/api.ts` (new server fns), `src/components/category-manager.tsx` (show matrix when `weight_method === "matrix"`)
- Test: `src/test/matrix-sync.test.ts`

**Interfaces:**
- Produces:
  - `type MatrixCell = { id: string; category_id: string; grade: string | null; size_mm: number; size_label: string; class: string; kg_per_m: number; od_mm: number | null; id_mm: number | null; wall_mm: number | null }`
  - `planMatrixSync(cells: MatrixCell[], prevCells: MatrixCell[], grades: string[], products: { id: string; category: string; grade: string | null; size_mm: number | null; pn: string | null; active: number; weight_kg: number }[], label: string): { insert: NewProduct[]; update: { id: string; weight_kg: number; size_mm: number; name: string; active: 1 }[]; deactivate: string[] }`
    - key = `(category, grade, size_mm, class)`; class compared to `pn` after removing spaces + upper-casing
    - a cell whose `id` exists in `prevCells` with a different size/class is matched to products by the **previous** key, so an edited row updates its products (no duplicate)
    - `saveMatrix` keeps cell ids stable and returns the previous cells; `syncMatrixProducts` runs right after save with both
    - cell with `grade` null fans out to every grade in `grades`
    - `kg_per_m` 0 or cleared cell → product id in `deactivate`; never delete
    - product name: `${label} ${grade} ${size_label} ${class}` (e.g. `DWC Pipe PE80 DN 110 SN 8`)
  - server: `listMatrix({ category_id })`, `saveMatrix({ category_id, cells })` → saves (upsert by id, delete removed ids) then runs the sync with old + new cells and returns `{ inserted, updated, deactivated }` — adminOnly
  - CSV columns: `size_label,size_mm,class,grade,kg_per_m,od_mm,id_mm,wall_mm` (use existing `src/lib/csv.ts`)

- [ ] **Step 1: Failing tests:** new cell → 1 insert per grade (grade null, grades `["PE80","PE100"]` → 2 inserts with `rate_group_id` `dwc:PE80`/`dwc:PE100`); existing product with same key and different weight → 1 update, 0 inserts (Review Focus 5); cell `c1` changed from size 110 to 111 (prevCells has `c1` at 110, product exists at 110) → 1 update with `size_mm: 111`, 0 inserts; cell kg 0 → `deactivate` contains product id; hand-made product `{category:"dwc",grade:"PE80",size_mm:110,pn:"sn 8"}` matches cell `class:"SN 8"` → update (adopted).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement planner, server fns, editor grid (rows = size, columns = class, cell = kg/m; side columns OD/ID/wall; add row / add class; CSV import/export; Save shows "N added, N updated, N deactivated").
- [ ] **Step 4:** Tests PASS; tsc + eslint clean; browser: enter DWC DN 110 SN 8 = 1.2 kg/m, sync → 2 products appear under Products; quote picker finds "dwc 110 sn8".
- [ ] **Step 5:** Commit `feat(catalog): editable weight matrix with product sync`.

---

### Task 7: Drawings per subcategory

**Files:**
- Modify: `src/components/pipe-section.tsx` (optional `colour?: string`), `src/components/quote-document.tsx:230-240`, `src/lib/pipe-spec.ts:25`
- Create: `src/components/dwc-section.tsx`
- Test: `src/test/quote.test.ts` (pipe-spec cases)

**Interfaces:**
- `pipeSpec` accepts `category` whose `drawing` is `pipe` or `sprinkler` (via `categoryDefaults(c).drawing`) instead of the literal `pipe|sprinkler` check.
- `colourHex(name: string): string | null` in `pipe-section.tsx` — maps common names (black, orange, yellow, red, blue, green, grey/gray, white, brown) to hex; unknown → null (draw default dark wall).
- `<PipeSection spec colour? />` — wall fill = `colourHex(colour) ?? "#1e293b"`, label line adds `· {colour}`.
- `<DwcSection idMm odMm cls />` — corrugated outer ring (teeth) + smooth inner ring, labels ID, OD, SN; same 180×60 viewBox and print size as PipeSection.
- quote-document picks by `categoryDefaults(line.category).drawing`; colour from the product's `specs.Colour` (lines carry description only → parse `(Colour: X` from description, which `quoteTitle` already writes).

- [ ] **Step 1: Failing tests:** `pipeSpec({category:"plb",description:"PLB Duct PE80 40 mm PN 6",unit:"m",weightKg:0.3})` returns `od 40` (after registering plb with drawing `pipe`); `colourHex("Orange")` → `"#f97316"`; `colourHex("teal-ish")` → `null`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** PASS; open a quote with a PLB line (Colour Orange) and a DWC line in print preview → orange ring, DWC corrugated drawing.
- [ ] **Step 5:** Commit `feat(quote): PLB colour and DWC drawings`.

---

### Task 8: Group price list and quote picker by parent → subcategory → grade

**Files:**
- Modify: `src/routes/_authenticated/price-list.tsx`, `src/routes/_authenticated/new-quote.tsx` (catalog picker chips), `src/lib/catalog.ts:16-21` (`sectionOf`)

**Interfaces:**
- `sectionOf(p)` → `"${subcategoryLabel} ${grade}"` for graded categories (e.g. `HDPE Pipe PE80`, `PLB Duct PE63`), fitting families unchanged.
- Price list: one heading per parent; HDPE-formula subcategories (`weight_method` `is4984`) print the existing size × PN tables per grade; `matrix` subcategories print size × class tables per grade; others print the existing two-column list. Header subtitle uses the parents' labels instead of the hard-coded "HDPE & sprinkler pipes".
- Picker: parent chips first, then subcategory chips; search unchanged.

- [ ] **Step 1:** Implement. **Step 2:** tsc/eslint/vitest clean. **Step 3:** Browser: price list prints HDPE Pipe PE63/80/100, PLB tables (once products exist), DWC table; picker search "63 pn6" still finds pipes in one keystroke-run.
- [ ] **Step 4:** Commit `feat(catalog): group price list and picker by tree`.

---

### Task 9: Verify against production data and deploy

- [ ] **Step 1:** Export prod D1 to scratch (`wrangler d1 export DB --remote --output scratch/prod.sql`), load into sqlite, apply 0023, rerun Task 2 Step 2 queries → all pass.
- [ ] **Step 2:** `./deploy.sh` checks (tsc, tests) pass; open PR, merge to main after owner OK (CI applies the remote migration and deploys).
- [ ] **Step 3:** On crm.tarko.in: open a saved quote → totals unchanged; create a new quote with HDPE PE80 and sprinkler → same prices as before.
