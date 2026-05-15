# Industry Classification Methodology

> How and why we classify Method CRM's ~3,900 accounts into industry segments.
> Living document — updated with each taxonomy version.

---

## 1. Purpose

Classification enables three things we can't do without it:

1. **Retention analysis by industry** — Which industries churn most? Which have highest GRR? Where should PS focus?
2. **Segmentation for GTM** — Target messaging, pricing, and onboarding by industry. Identify whitespace.
3. **PS targeting** — PS adoption is 23% overall but varies wildly by industry. Classification tells us where to push.

Without classification, every account is a snowflake. With it, we can see patterns across 3,900+ accounts.

---

## 2. Taxonomy Design Principles

### 2.1 Hierarchy: L1 → L2 → L3

| Level | Purpose | Governed by | Target count |
|-------|---------|------------|--------------|
| **L1** | Operating-model archetype | What they sell × who they serve × how they deliver | 4 (fixed) |
| **L2** | Trade, function, or industry group | What kind of work they do | 25–35 |
| **L3** | Specialization within the group | Specific niche or sub-trade | 75–90 |

### 2.1.a Unified principle for L1s

> **Each L1 is an operating-model archetype, defined by three dimensions: what they sell, who they serve, and how they deliver. L1s exist because Method customers within each archetype share workflow needs, pain points, pricing tiers, and product usage patterns.**

The four archetypes:

| L1 | What they sell | Who they serve | How they deliver | Method usage signature |
|---|---|---|---|---|
| **Manufacturing & Distribution** (M&D) | Physical goods | B2B | Inventory + quote/invoice cycle | Item lists, multi-line invoicing, inventory tracking, dealer accounts |
| **Professional & Business Services** (PBS) | Expertise & knowledge | B2B | Desk-based + project billing | Time tracking, project billing, retainer/recurring invoices |
| **Field Services & Trades** (FS&T) | Skilled labor | Mixed (residential + commercial) | Mobile workforce + work orders | Scheduling, dispatch, work orders, mobile app, route optimization |
| **Retail & Consumer** (R&C) | Goods + experiences | B2C | Storefront/venue + POS or appointments | POS, appointments, recurring memberships, walk-in traffic |

### 2.1.b Naming convention

L1 names use **vernacular customer self-IDs** — the words operators in each archetype use to describe themselves — rather than principle-explicit labels. For example:

- "Manufacturing & Distribution" lists two terms operators use ("we manufacture" / "we distribute"), not the underlying principle ("B2B Goods Supply Chain").
- "Field Services & Trades" lists both "field services" (mobile cleaning/pest/security) and "trades" (electricians/plumbers — vernacular self-ID for licensed skilled work) so every operator in the bucket sees themselves.
- "Retail & Consumer" extends past strict retail because gyms, restaurants, salons, and personal services don't self-ID as "retail" but share the B2C storefront/venue operating model.

This trades naming consistency for operator recognition. The unified principle lives in the matrix above; the L1 names are coverage labels.

**The renaming from V7.0 to V7.1 (May 2026) cleaned up two redundancies:**

| V7.0 (old) | V7.1 (new) | Why |
|---|---|---|
| Manufacturing, Wholesale & Distribution | **Manufacturing & Distribution** | "Wholesale" is a synonym of "Distribution" in Method's universe — operators self-ID as both interchangeably. Dead weight removed. |
| Services & Trades | **Field Services & Trades** | "Services" alone collided with "Business Services" in PBS. "Field" makes the on-site delivery model explicit and disambiguates. |

### 2.2 Why 4 L1s?

These four map to fundamentally different business models that drive different:
- **Revenue patterns** (recurring vs project vs transactional)
- **Churn drivers** (seasonal work vs client satisfaction vs product-market fit)
- **Method CRM usage** (invoicing vs project tracking vs client management)
- **PS value proposition** (workflow automation vs reporting vs integrations)

We considered a 5th L1 for Non-profit but rejected it: only ~144 accounts (3.7%), and non-profits use Method CRM operationally the same way as other PBS businesses. They're split at L3 instead (Non-profit, Government, Religious).

### 2.3 L2 Design Rules

Each L2 should represent a **recognizable trade or industry group** where:
- Practitioners would self-identify ("I'm in HVAC" / "I'm a landscaper")
- Retention behavior is likely similar within the group
- Method CRM usage patterns are likely similar
- The group has enough accounts to be analytically useful (target: 15+ accounts)

**When to promote an L3 to L2:**
- The L3 has 40+ accounts AND distinct economics from its sibling L3s
- The parent L2 is becoming a grab-bag where the L3s don't share behavior
- Parallel structure demands it (e.g., Medical has separate Mfg + Distrib L2s, so Electronics should too)

### 2.4 L3 Design Rules

Each L3 should be a **specific enough niche** that:
- An account can be placed with reasonable confidence
- The category has a plausible population of 5+ accounts
- It's not redundant with another L3 (no splitting hairs)

**When NOT to create an L3:**
- Fewer than 5 plausible accounts — the niche is too narrow for Method's customer base
- The distinction doesn't matter for retention/segmentation analysis
- The split would create classifier confusion without analytical value

---

## 3. Distribution Guardrails

These guardrails prevent the taxonomy from becoming lopsided or catch-all heavy.

| Metric | Target | Why |
|--------|--------|-----|
| **No L1 > 35%** | Each L1 should hold 9–35% of accounts | If one L1 dominates, the taxonomy isn't differentiating enough |
| **No single L3 > 8%** | Max ~310 accounts in one L3 | A giant L3 is a catch-all in disguise |
| **Catch-all L3s < 10% combined** | "General", "Other", "Specialty" categories summed | High catch-all usage means the taxonomy has gaps |
| **Review rate < 15%** | Accounts flagged for manual review | Too many flags = rules are ambiguous |

### Current distribution (V6 → V7.1):

| L1 | V6 % | V7.1 actual |
|----|------|-------------|
| Manufacturing & Distribution (M&D) | 30.7% | 31.7% |
| Professional & Business Services (PBS) | 32.8% | 30.8% |
| Field Services & Trades (FS&T) | 26.9% | 25.5% |
| Retail & Consumer (R&C) | 9.1% | 8.8% |
| UNCLASSIFIABLE | n/a | 3.1% |

### Catch-all L3s to monitor:

| L3 | V6 count | V6 % | Notes |
|----|----------|------|-------|
| Bookkeeping & Payroll Services | 224 | 5.7% | Legitimate concentration — Method's #1 vertical |
| Specialty Retail | 188 | 4.8% | Under investigation for V7 sub-splits |
| Other Home Services (V7) | ~40 | ~1.0% | New catch-all, watch for growth |
| Other Commercial Field Services (V7) | ~30 | ~0.8% | New catch-all, watch for growth |
| General Wholesale & Distribution | 62 | 1.6% | Stable |
| Strategy & Management Consulting | 87 | 2.2% | Tightened QB rules should reduce |

---

## 4. Disambiguation Rules

When a business could fit multiple categories, these rules resolve the ambiguity. Rules are numbered for reference in classification reasoning.

### The Classification Matrix (Rules 1 & 2)

Classification depends on two axes: **who made the product** and **who buys it**.

| | Makes the product | Resells the product |
|---|---|---|
| **Sells B2B** | M&D > appropriate Manufacturing L2 | M&D > appropriate Distribution L2 |
| **Sells B2C (storefront is primary channel)** | M&D > Manufacturing (tag `b2c_channel`) | Retail & Consumer |
| **Sells both B2B and B2C** | M&D > Manufacturing (tag `b2b_and_b2c`) | Apply storefront test |

### Rule 1: Manufacture vs Install vs Service

| Signal | Classification |
|--------|---------------|
| Has own factory/brand, produces physical goods | **M&D** (even if also installs — installation is a delivery mechanism, not a classification driver) |
| Installs products made by others (e.g., flooring installer) | **Field Services & Trades** |
| Makes AND installs own products (e.g., custom cabinetry shop) | **M&D** — classify by what they manufacture, tag `business_model: make_and_install` |
| Primarily dispatches technicians but also sells equipment | **Field Services & Trades** |

**Key principle:** A cabinet maker who also installs is still a cabinet maker (M&D > Furniture & Fixtures). A blinds manufacturer who also installs is still a blinds manufacturer (M&D > Home Improvement Products). The "also installs" component is captured as a business model tag, not an industry classification. See §10 Business Model Tagging.

### Rule 2: Retail vs Distribution (Storefront Test)

| Signal | Classification |
|--------|---------------|
| Sells exclusively to businesses (B2B), no consumer storefront | **M&D > appropriate Distribution L3** |
| Sells exclusively to consumers (B2C), has storefront/ecommerce/cafes | **Retail & Consumer** |
| Does both B2B and B2C | Apply the **storefront test** (see below) |
| Reseller (buys and resells, no manufacturing) | Storefront test determines Retail vs Distribution |

**Storefront test:** Does the company operate physical retail locations, consumer-facing cafes, or a B2C ecommerce store as a **primary** channel?
- **YES** → Retail & Consumer
- **Incidental B2C** (distributor with small showroom) → M&D

Examples:
- Irving Farm (coffee roaster with cafes + online store) → Retail > Food & Beverage Retail *(cafes = storefront)*
- A Beep (two-way radio reseller to businesses) → M&D > Electronics & Technology Distribution *(B2B, no consumer storefront)*
- A&M Discount Furniture (home furniture store) → Retail > Specialty Retail *(consumer storefront)*
- Electric truck dealer (authorized dealer to fleet buyers) → Retail > Automotive Services & Retail *(dealer = consumer-facing)*

### Rule 3: Repair Businesses

| Signal | Classification |
|--------|---------------|
| Repairs at customer site (residential) | **FS&T > Home & Property Services > Residential Repair & Maintenance** |
| Repairs at customer site (commercial/industrial) | **FS&T > Industrial & Commercial Field Services > Commercial Repair & Maintenance** |
| Repair shop (customer brings item in) | **Retail & Consumer > appropriate L2** |

### Rule 4: Healthcare / Education / Non-profit

| Signal | Classification |
|--------|---------------|
| Medical practice/clinic (provides care) | **PBS > Healthcare & Medical Services** |
| Medical device/pharma MANUFACTURER | **M&D > Medical & Life Sciences Manufacturing** |
| Medical supply DISTRIBUTOR | **M&D > Medical & Pharmaceutical Distribution** |
| Educational institution / training / enrichment | **PBS > Education & Research** or **Coaching & Training** |
| Non-profit / charity / foundation | **PBS > Non-profit & Charitable Organizations** |
| Government / public sector | **PBS > Government & Public Sector** |
| Church / temple / ministry | **PBS > Religious Organizations** |

### Rule 5: Printing, Creative & Branded Products

| Signal | Classification |
|--------|---------------|
| Manufactures printing equipment / machinery | **M&D > Industrial Equipment Manufacturing** |
| Commercial print shop, sign shop, screen printing | **PBS > Printing & Graphics** |
| Custom embroidery/printing on workwear/uniforms | **PBS > Printing & Graphics** *(production service, not marketing strategy)* |
| Graphic design, marketing agency, creative studio | **PBS > Marketing & Advertising** or **Creative & Production Services** |
| News organization, publisher, digital media outlet/app | **PBS > Media & Publishing** *(NOT Marketing & Creative Services)* |

### Rule 6: Home Watch vs Property Management vs Security

| Signal | Classification |
|--------|---------------|
| Physical property checks, monitoring vacant/seasonal homes | **FS&T > Home Watch > Home Watch Services** |
| "Home Watch" or "homewatch" in company name | **FS&T > Home Watch > Home Watch Services** *(name override, 0.90 confidence)* |
| Administrative property management (leasing, rent, HOA) | **PBS > Property Management** |
| Home security system installation | **FS&T > Security & Alarm Systems** *(NOT Home Watch)* |
| Home inspection (pre-purchase) | **FS&T > Industrial & Commercial Field Services > Specialty Inspection & Compliance** |

### Rule 7: Agriculture

| Signal | Classification |
|--------|---------------|
| Farm/ranch producing goods, nursery, garden center | **Retail & Consumer > Agriculture & Farming** |
| Farm equipment manufacturer | **M&D > Industrial Equipment Manufacturing** |
| Farm supply distributor | **M&D > appropriate distribution L3** |
| Farm consulting | **PBS > Strategy & Management Consulting** |

### Rule 8: IT / Technology / QuickBooks

| Signal | Classification |
|--------|---------------|
| QB consultant who DOES bookkeeping/accounting for clients | **PBS > Bookkeeping & Payroll Services** |
| QB consultant who IMPLEMENTS/TRAINS/CONFIGURES software | **PBS > IT Consulting & Implementation** |
| Builds/sells own software products (SaaS, apps, platforms) | **PBS > Software & SaaS** |
| IT consulting, managed services, cybersecurity | **PBS > IT Services & Technology > appropriate L3** |
| VoIP/cloud communications provider | **PBS > IT Services & Technology > Telecommunications** *(NOT M&D)* |
| Telecom equipment manufacturer | **M&D > Electronics & Technology Manufacturing** |
| Cabling/low-voltage installer (on-site) | **FS&T > Industrial & Commercial Field Services** |

**QB Test:** Does the client send this firm their books to be done? → Accounting. Does the client hire this firm to set up or teach QB? → IT Consulting.

### Rule 9: Excavation, Drainage & Septic

| Signal | Classification |
|--------|---------------|
| Excavation, grading, earthwork, demolition | **FS&T > Specialty Construction > Excavation & Earthwork** |
| Drainage installation, septic system installation | **FS&T > Specialty Construction > Excavation & Earthwork** *(NOT HVAC/Plumbing)* |
| Septic pumping/maintenance (ongoing service) | **FS&T > Home & Property Services > Residential Repair & Maintenance** |

### Rule 10: On-site vs Shop Fabrication

| Signal | Classification |
|--------|---------------|
| Shop-based metal fabrication | **M&D > Industrial Manufacturing > Metal Fabrication & Structural** |
| On-site/mobile welding and fabrication | **FS&T > Industrial & Commercial Field Services > Welding & Fabrication Services** |
| Makes in shop AND installs on-site | **M&D** — classify by what they manufacture (tag `business_model: make_and_install`) |

### Rule 11: Specialty Services Routing

| Signal | Classification |
|--------|---------------|
| Wildlife removal, pest control, extermination | **FS&T > Home & Property Services > Pest Control** |
| Compressed air audits, leak detection, technical inspections | **FS&T > Industrial & Commercial Field Services > Specialty Inspection & Compliance** |
| On-site printer/copier repair | **FS&T > Home & Property Services > Residential Repair & Maintenance** (or Commercial if B2B) |
| Painting contractor (residential or commercial) | **FS&T > Home & Property Services > Painting & Surface Coating** |
| Pool coatings/resurfacing | **FS&T > Home & Property Services > Painting & Surface Coating** *(surface work, not pool construction)* |
| Mobility equipment sales (stairlifts, accessible vehicles) | Storefront test: B2C sales → **Retail > Specialty Retail**; primarily installs → **FS&T > Home & Property Services** |

### Rule 12: Distribution Requires Evidence of Reselling

When descriptions use vague "provides/offers/specializes in products" language:

| Signal | Classification |
|--------|---------------|
| Production signals (formulates, extracts, processes, grows, bakes, brews, blends, "in-house", "own facility") | **M&D > appropriate Manufacturing L3** |
| Reselling signals (dealer for [brand], authorized reseller, sources from manufacturers, carries multiple brands) | **M&D > appropriate Distribution L3** |
| Neither signal is clear | Flag `needs_manual_review = true` — do NOT default to distribution |

Audit found 16 manufacturers misclassified as distributors due to vague descriptions.

### Rule 13: Contract Processing Services

Contract processing (powder coating, galvanizing, anodizing, heat treating, plating) where the customer owns the material → **stays in M&D** (manufacturing ecosystem). These businesses self-identify with manufacturing.

### Rule 14: Transportation & Logistics vs Service Businesses

| Signal | Classification |
|--------|---------------|
| Trucking hauling goods, 3PL, warehousing, freight brokerage | **M&D > Transportation & Logistics** |
| Moving/relocation (household or commercial), towing, rigging | **FS&T > Industrial & Commercial Field Services > Moving & Relocation** |
| Passenger transit, jet charter | Flag as edge case |
| Truck parking/storage | **PBS > Real Estate & Property** |

### Rule 15: Artisan vs Industrial Manufacturing

| Signal | Classification |
|--------|---------------|
| Handcrafted ceramics, artisan candles, bespoke jewelry, custom leather | **M&D > Artisan & Custom Manufacturing** |
| Commodity chemicals, coatings, sealants, cleaning compounds | **M&D > Chemical & Process Manufacturing** or **Industrial Manufacturing** |
| Engraving/stamping/3D printing as a service (customer's design) | **Field Services & Trades** or **PBS > Printing & Graphics** |

Small company size alone does NOT make something "artisan." Classify by what the product is.

### Rule 16: Strategy & Consulting — Not a Catch-All

| Signal | Classification |
|--------|---------------|
| Advises on business strategy, operations, management | **PBS > Strategy & Management Consulting** |
| Technical domain specialist (compressed air, water treatment) | Route to domain-specific category |
| "Consulting" in name but no evidence of consulting activity | Flag `needs_manual_review` — do NOT default to consulting |
| Confidence < 0.60 | Output **UNCLASSIFIABLE** instead |

V6 audit found 54% error rate in this category. Never classify here without positive evidence.

---

## 5. Confidence Scoring

All confidence scores are normalized to 0.0–1.0.

| Range | Label | Meaning |
|-------|-------|---------|
| 0.85–1.0 | High | Clear match — strong signals, no ambiguity |
| 0.65–0.84 | Medium | Reasonable match with some ambiguity |
| 0.40–0.64 | Low | Weak signals, multiple possible categories |
| 0.00–0.39 | Very Low | Insufficient information to classify |

### UNCLASSIFIABLE status:

When confidence < 0.50 AND there is no usable business description, website content, or evidence: output `l1: UNCLASSIFIABLE`. Do NOT force a guess into a catch-all category. These accounts are excluded from analysis and flagged for data enrichment. V6 audit found ~20+ accounts dumped into Strategy & Consulting and General Wholesale as defaults — this pollutes real categories.

### When to flag `needs_manual_review = true`:

1. Confidence < 0.6
2. Self-selected vertical disagrees with AI classification AND confidence < 0.8
3. Business clearly spans 2+ L1 categories (classify by primary activity, but flag)
4. No business description AND no evidence available
5. Business appears inactive, dissolved, or parked domain
6. Franchise/chain duplicate detected

### Name override rules (set confidence = 0.90):

- "Home Watch" or "homewatch" in account name → Home Watch Services
- homewatchit.com domain → Home Watch Services

---

## 6. Quality Metrics

Run these checks after every classification batch.

### Validation checks:

| Check | Target | How |
|-------|--------|-----|
| **Coverage** | 100% of accounts have L1 + L2 + L3 | No blanks allowed |
| **Integrity** | Every L3 in output exists in TAXONOMY CSV | Compare against canonical file |
| **Hierarchy** | Every L3→L2→L1 chain matches taxonomy exactly | Automated join check |
| **L1 balance** | No L1 > 35% | Check distribution |
| **L3 concentration** | No single L3 > 8% | Check distribution |
| **Catch-all budget** | "General" / "Other" L3s combined < 10% | Sum catch-all L3s |
| **Review rate** | `needs_manual_review` < 15% | Count flagged accounts |
| **Zero-count L3s** | < 5 L3s with 0 accounts | A category nobody falls into may be wrong |

### Post-classification report:

After each batch, produce a summary showing:
1. L1 distribution (count + %)
2. Top 10 and bottom 10 L3s by count
3. Catch-all L3 totals
4. Confidence distribution (High/Medium/Low/Very Low counts)
5. Needs-review count and reasons
6. Comparison to previous version (what moved where)

---

## 7. Classification Process

### Data inputs per account:

| Field | Source | Weight |
|-------|--------|--------|
| Business_Description | Pre-enriched (Ivan's pipeline + Clay) | Primary signal |
| Self_Selected_Vertical | Account signup form | Secondary signal (often generic) |
| Account_Name | CRM | Name override rules only |
| Domain | CRM | Domain-based inference when description is weak |
| Evidence | Enrichment notes | Supporting detail |

### Single-pass classification:

Each account is classified in a single Claude API call with:
- Full taxonomy (TAXONOMY_V7.csv)
- All disambiguation rules (Rules 1–11)
- The account's data fields

Output per account: `l1`, `l2`, `l3`, `confidence`, `reasoning`, `needs_manual_review`

### Manual review loop:

1. Run automated classification on full population
2. Extract flagged accounts (`needs_manual_review = true`)
3. Human reviews flagged accounts, corrects classifications
4. Collect patterns from corrections (e.g., "classifier keeps putting excavation under plumbing")
5. Update disambiguation rules to address patterns
6. Re-run on affected populations
7. Update taxonomy version if structural changes needed

This is how V6 → V7 happened: manual review of ~80 accounts surfaced 11 rule gaps and 5 structural issues.

---

## 8. Version History

| Version | Date | L1s | L2s | L3s | Key changes |
|---------|------|-----|-----|-----|-------------|
| V4 | 2026-03-05 | 4 | 27 | 71 | Initial taxonomy with 8 disambiguation rules |
| V6 | 2026-03-23 | 4 | 28 | 83 | Split Accounting (3 L3s), IT Services (5 L3s), Property (2 L3s). Added field service L3s. Renamed M&D. 3,909 accounts classified. |
| V7 | 2026-04-09 | 4 | 32 | ~89 | Dissolved Manufacturing & Installation (102 accounts → M&D by product type). Promoted Electronics Distrib, Building Materials Distrib, Software & SaaS to L2. Split Other Field Services into Home & Property + Industrial & Commercial. Split Non-profit 3 ways. Added Chemical Mfg, Welding L3s. Rules 9-11. Storefront test. Business model tagging. |
| V7.1 | 2026-05-08 | 4 | 32 | ~89 | **L1 naming convention update.** Renamed "Manufacturing, Wholesale & Distribution" → "Manufacturing & Distribution" (Wholesale was redundant with Distribution). Renamed "Services & Trades" → "Field Services & Trades" (disambiguates from Business Services in PBS, makes on-site delivery model explicit). Documented unified operating-model principle in §2.1.a. No accounts moved between L1s. No structural changes to L2/L3. |

### V7 change rationale:

**Manufacturing & Installation dissolved:** The L2 was a business model category ("makes + installs"), not an industry category. A cabinet maker who also installs is still a cabinet maker. The 102 accounts redistributed to M&D L3s by what they manufacture. Installation capability is now captured via business model tagging (§10).

**Structural:** Manual review of ~80 accounts revealed fuzzy Retail/Distribution boundary (storefront test added), field services dumped into single catch-all (split into residential vs commercial), and several L3s the classifier never routed to (rule fixes).

**New L2s:** Electronics Distribution and Building Materials Distribution promoted to match Medical/Industrial pattern. Software & SaaS promoted for distinct economics.

**Rules 9-11:** Excavation routing, on-site vs shop fabrication, specialty services routing.

### V7 audit findings (April 10, 2026):

Four full-population audits validated the taxonomy and surfaced additional rule needs:

| Population | Audited | Error Rate | Key Finding |
|---|---|---|---|
| Distribution | 512 | 3% (16 wrong) | Manufacturers using vague "provides products" language defaulted to distribution. Rule 12 added. |
| Manufacturing | 689 | 5% (35 wrong) | Contract service companies (powder coaters, galvanizers) + distributors. Rule 13 added. |
| Strategy & Consulting | 87 | **54%** (31 wrong) | Dumping ground for unknowns. Rule 16 + UNCLASSIFIABLE status added. |
| Transportation & Logistics | 31 | 35% (11 wrong) | Service businesses (movers, towing, jet charter) in M&D. Rule 14 added. |
| Artisan & Custom Mfg | 109 | 26% (28 wrong) | Industrial/chemical manufacturers classified as "artisan" due to small size. Rule 15 added. |

**B2B/B2C matrix:** Made the two-axis classification model explicit — "who made it" × "who buys it" — as a reference framework for Rules 1 and 2.

**Duplicate accounts:** 7+ duplicate sets found (Garage Living x8, Refresh Creations x3, Manex USA x3, etc.). Flagged for CRM cleanup, separate from taxonomy work.

---

## 10. Business Model Tagging (Future)

Industry classification (L1/L2/L3) answers **"what does this business do?"** but doesn't capture **"how does this business operate?"** Business model tags are an orthogonal dimension that can be layered on top of industry classification without changing the taxonomy structure.

### Why this matters

Two businesses in the same L3 can have very different:
- **Revenue models** (subscription vs project vs transactional)
- **Seasonality** (year-round vs seasonal spikes)
- **Customer relationships** (recurring vs one-off)
- **Churn risk profiles** (contract-based vs month-to-month)

Business model tags let us analyze these patterns without fragmenting the industry taxonomy.

### Proposed tags (not yet implemented)

| Tag | Description | Example |
|-----|-------------|---------|
| `make_and_install` | Manufactures products AND installs them on-site | Cabinet shop that builds + installs; blinds manufacturer with install crews |
| `franchise` | Franchise location or franchise system | Garage Living locations, franchise consulting |
| `b2b` | Primarily sells to businesses | Industrial distributor, IT consulting firm |
| `b2c` | Primarily sells to consumers | Retail store, home services |
| `b2b_and_b2c` | Meaningful revenue from both channels | Manufacturer with wholesale + retail storefront |
| `subscription` | Recurring subscription revenue model | SaaS, managed IT services, property management |
| `project_based` | Revenue from discrete projects/SOWs | Construction, IT implementation, consulting |
| `seasonal` | Significant seasonal variation | Tax prep (Q1), landscaping (spring/summer), holiday retail |

### Implementation approach

1. Add a `business_model_tags` column to the classified accounts CSV (comma-separated)
2. Tags are additive — an account can have multiple tags
3. Start with `make_and_install` for the ~102 accounts dissolved from Manufacturing & Installation
4. Add other tags in subsequent passes as analytical needs arise
5. Tags do NOT affect L1/L2/L3 classification — they are metadata

### When to add new tags

Add a business model tag when:
- You find yourself wanting to split an L3 by "how they operate" rather than "what they do"
- Retention analysis reveals that business model matters more than sub-industry for a cohort
- A cross-cutting pattern spans multiple L2s (e.g., franchise businesses exist in FS&T, R&C, and PBS)

Do NOT add tags that duplicate what the taxonomy already captures (e.g., don't tag "manufacturer" — that's what the M&D L1 means).

---

## 11. Files & Locations

| File | Location | Purpose |
|------|----------|---------|
| Taxonomy CSV | `05-SCRATCH/2026-03-23-classification/TAXONOMY_V7.csv` | Canonical V7 taxonomy |
| Previous taxonomy | `05-SCRATCH/2026-03-23-classification/TAXONOMY_V6.csv` | V6 for comparison |
| Classification rules | `02-REFERENCE/Systems/industry-classification-rules.md` | Disambiguation rules (update to V7) |
| Classified accounts | `05-SCRATCH/2026-03-23-classification/classified_all_accounts.csv` | All 3,909 accounts with classifications |
| This document | `02-REFERENCE/Systems/classification-methodology.md` | Methodology reference |
| Classify skill | `.claude/commands/classify.md` | Claude Code skill for running classification |
| Metrics spine | `02-REFERENCE/Systems/metrics-spine.md` | Where classification feeds into metrics |
