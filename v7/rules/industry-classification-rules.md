# Industry Classification Rules — V7 Taxonomy

> 4 core principles + taxonomy-embedded category guidance.
> Last updated: 2026-04-14
> Full methodology: `rules/classification-methodology.md`

---

## Taxonomy Structure

4 L1 segments → 32 L2 categories → ~89 L3 categories

### L1: Manufacturing & Distribution (M&D)
Product-centric businesses that make, wholesale, or distribute physical goods.

| L2 | L3 Categories |
|----|---------------|
| Industrial Manufacturing | Industrial Equipment Mfg · Metal Fabrication & Structural · Precision Parts & Components · Safety & Security Equipment · Chemical & Process Manufacturing |
| Consumer Products Manufacturing | Furniture & Fixtures · Apparel & Textiles Mfg · Artisan & Custom Mfg · Home Improvement Products |
| Food & Beverage Manufacturing | Food & Beverage Manufacturing |
| Medical & Life Sciences Manufacturing | Medical Device Mfg · Pharmaceutical & Biotech Mfg |
| Electronics & Technology Manufacturing | Electronics & Technology Mfg |
| Building Materials Manufacturing | Building Materials & Components · Packaging & Containers |
| General Wholesale & Distribution | General Wholesale & Distribution |
| Industrial & Equipment Distribution | Industrial Equipment & Machinery Distribution · Industrial & Commercial Supplies |
| Food & Beverage Distribution | Food & Beverage Distribution |
| Medical & Pharmaceutical Distribution | Medical & Pharmaceutical Distribution |
| Electronics & Technology Distribution | Electronics & Technology Distribution |
| Building Materials Distribution | Building Materials & Construction Supply |
| Specialty Distribution | Automotive Parts Distribution · Consumer Goods Distribution · Transportation & Logistics |

### L1: Field Services & Trades
Businesses that perform on-site work — field services, construction, installation, maintenance.

| L2 | L3 Categories |
|----|---------------|
| General Contracting | General Contracting |
| Specialty Construction | Roofing · Concrete & Masonry · Excavation & Earthwork · Other Specialty Construction |
| Flooring & Interior Finishing | Flooring & Interior Finishing |
| HVAC, Plumbing & Electrical | HVAC Services · Plumbing Services · Electrical Services |
| Landscaping & Outdoor Services | Landscaping & Lawn Care · Pool & Spa Services |
| Cleaning & Environmental Services | Cleaning Services · Environmental Services · Recycling & Waste Management |
| Security, Fire & Alarm Systems | Security & Alarm Systems · Fire & Safety Systems |
| Home Watch | Home Watch Services |
| Home & Property Services | Painting & Surface Coating · Pest Control · Residential Repair & Maintenance · Other Home Services |
| Industrial & Commercial Field Services | Welding & Fabrication Services · Specialty Inspection & Compliance · Moving & Relocation · Water Services & Well Drilling · Commercial Repair & Maintenance · Other Commercial Field Services |

### L1: Professional & Business Services
Knowledge work, consulting, office-based services, institutions.

| L2 | L3 Categories |
|----|---------------|
| Strategy & Consulting | Strategy & Management Consulting |
| Real Estate & Property | Property Management · Real Estate Brokerage & Sales |
| Accounting & Bookkeeping | Tax Preparation & CPA Services · Bookkeeping & Payroll Services · Fractional CFO & Advisory |
| IT Services & Technology | Managed IT Services (MSP) · IT Consulting & Implementation · Data & Analytics Services · Telecommunications |
| Software & SaaS | Software & SaaS |
| Legal Services | Legal Services |
| Architectural & Engineering | Architectural & Engineering Services |
| Marketing & Creative Services | Marketing & Advertising · Creative & Production Services · Media & Publishing · Printing & Graphics |
| Healthcare & Medical Services | Healthcare & Medical Services |
| Education & Training | Education & Research · Coaching & Training |
| Non-profit & Government | Non-profit & Charitable Organizations · Government & Public Sector · Religious Organizations |
| Financial & Insurance Services | Financial & Insurance Services · Fintech & Payment Processing |
| Staffing & HR Services | Staffing & HR Services |

### L1: Retail & Consumer
Sells products or services directly to consumers (B2C).

| L2 | L3 Categories |
|----|---------------|
| Consumer Retail | General Consumer Retail · Specialty Retail |
| Food & Beverage Retail / Hospitality | Food & Beverage Retail · Hospitality & Tourism |
| Automotive Services & Retail | Automotive Services & Retail |
| Pet Services & Products | Pet Services & Products |
| Personal Care & Recreation | Personal Care & Wellness · Sports & Recreation |
| Events & Entertainment | Events & Entertainment |
| Agriculture & Farming | Agriculture & Farming |

---

## Core Classification Principles

These four principles govern every classification decision. Category-specific guidance lives in the taxonomy CSV `disambiguation_notes` column — always check it when selecting an L3.

### Principle 1: Classify by Identity, Not Activity

**"What would this person say they do at a cocktail party?"**

A business is classified by what it IS (its identity), not by how it operates (its business model). When a business spans manufacturing AND installation, or distribution AND service, classify by identity:

| Identity Signal | Classification |
|---|---|
| Has own factory/brand, produces physical goods | **M&D** — even if also installs. Installation is a delivery mechanism, not a classification driver. Tag `business_model: make_and_install`. |
| Installs/services products made by others | **Field Services & Trades** |
| Dispatches technicians but also sells equipment | **Field Services & Trades** — service identity, equipment is incidental |
| Consultant who specializes in a technical domain | **PBS > Strategy & Consulting** — a consultant is a consultant regardless of their domain |

Use the Classification Matrix to determine L1:

| | Makes the product | Resells the product |
|---|---|---|
| **Sells B2B** | M&D > Manufacturing | M&D > Distribution |
| **Sells B2C (storefront primary)** | M&D > Manufacturing (tag `b2c_channel`) | Retail & Consumer |
| **Sells both** | M&D > Manufacturing (tag `b2b_and_b2c`) | Apply Storefront Test |

### Principle 2: The Storefront Test (Retail vs Distribution)

When a reseller sells to both B2B and B2C customers, or when the channel is ambiguous:

**Does the company operate physical retail locations, consumer-facing cafes, or a B2C ecommerce store as a PRIMARY channel?**

- **YES** → Retail & Consumer
- **Incidental B2C** (distributor with a small showroom) → M&D > Distribution
- **Exclusively B2B**, no consumer storefront → M&D > Distribution

### Principle 3: Require Positive Evidence

Never infer a classification from absence of information.

**Distribution requires reselling evidence.** Vague "provides/offers/specializes in products" language is NOT a distribution signal. Look for: dealer for [brand], authorized reseller, sources from manufacturers, carries multiple brands. If neither manufacturing nor reselling signals are present, flag `needs_manual_review = true` — do NOT default to distribution.

**Manufacturing requires production evidence.** Look for: formulates, extracts, processes, grows, bakes, brews, blends, "in-house", "own facility."

### Principle 4: No Catch-All Defaults

Never use a "General", "Other", or broad category as a default when evidence is weak.

- **Strategy & Consulting** requires positive evidence of consulting activity. "Consulting" in a company name is not sufficient — flag for review instead.
- **General Wholesale & Distribution** — use a specific distribution L3 when any product focus is discernible.
- **Other Specialty Construction / Other Home Services / Other Commercial Field Services** — actively search for a more specific L3 before using these.
- If confidence < 0.50 AND no usable data → output **UNCLASSIFIABLE** rather than forcing a guess.

When you select any "General" or "Other" L3, you MUST confirm no more specific alternative exists.

---

## Classification Prompt Template

```
You are classifying business accounts into an industry taxonomy for Method CRM.

TAXONOMY (L1 > L2 > L3):
{full taxonomy from TAXONOMY_V7.csv — includes descriptions, examples, and disambiguation_notes per L3}

CORE PRINCIPLES:
{4 principles above}

For each account, return:
- l1: The L1 category name (exactly as listed)
- l2: The L2 category name (exactly as listed)
- l3: The L3 category name (exactly as listed)
- confidence: A float from 0.0 to 1.0
- reasoning: One sentence explaining the classification choice
- needs_manual_review: Boolean

Return JSON only. Category names must EXACTLY match the taxonomy — no variations.
```
