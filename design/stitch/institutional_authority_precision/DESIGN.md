---
name: Institutional Authority & Precision
colors:
  surface: '#f8f9ff'
  surface-dim: '#cfdbec'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eef4ff'
  surface-container: '#e4efff'
  surface-container-high: '#dee9fb'
  surface-container-highest: '#d8e3f5'
  on-surface: '#111c29'
  on-surface-variant: '#43474e'
  inverse-surface: '#26313e'
  inverse-on-surface: '#e9f1ff'
  outline: '#74777f'
  outline-variant: '#c4c6cf'
  surface-tint: '#435f89'
  primary: '#002043'
  on-primary: '#ffffff'
  primary-container: '#17365d'
  on-primary-container: '#84a0cd'
  inverse-primary: '#acc8f7'
  secondary: '#4b6078'
  on-secondary: '#ffffff'
  secondary-container: '#cce2fe'
  on-secondary-container: '#4f647c'
  tertiary: '#002524'
  on-tertiary: '#ffffff'
  tertiary-container: '#003d3b'
  on-tertiary-container: '#47aea9'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d5e3ff'
  primary-fixed-dim: '#acc8f7'
  on-primary-fixed: '#001c3b'
  on-primary-fixed-variant: '#2b486f'
  secondary-fixed: '#d0e4ff'
  secondary-fixed-dim: '#b3c8e4'
  on-secondary-fixed: '#051d32'
  on-secondary-fixed-variant: '#33485f'
  tertiary-fixed: '#90f3ee'
  tertiary-fixed-dim: '#73d7d2'
  on-tertiary-fixed: '#00201f'
  on-tertiary-fixed-variant: '#00504d'
  background: '#f8f9ff'
  on-background: '#111c29'
  surface-variant: '#d8e3f5'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '700'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
  body-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-lg:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.04em
  label-md:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  code-xs:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 14px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-compact: 0.5rem
  margin: 1.5rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style

The visual narrative conveys institutional rigor, absolute procedural security, and administrative efficiency. Built for high-stakes operational workflows, candidate registration, invigilation coordination, and result certification, the aesthetic rejects superficial consumer-tech decoration, hyperbolic whitespace, and ephemeral novelty in favor of authoritative clarity and density.

Drawing from high-security financial infrastructure and enterprise operations platforms, the interface balances a restrained modern corporate baseline with the structural precision of technical ledger software. Every viewport prioritizes actionable data density, strict spatial governance, and rapid legibility under high operational pressure.

## Colors

The palette establishes an immediate institutional baseline with an uncompromising focus on accessibility, contrast ratios (WCAG AAA for critical telemetry), and contextual awareness.

### Foundational Canvas & Structure
- **Primary Navy (`#17365D`)**: Used for the primary app bar, structural headers, high-level navigation chrome, and primary operational triggers.
- **Secondary Slate (`#52677F`)**: Governs secondary actions, active section groupings, filter toggles, and contextual iconography.
- **Accent Teal (`#168C88`)**: Dedicated to verified certifications, primary interactive targets requiring distinction, affirmative metrics, and secure timestamps.
- **Neutral Charcoal (`#202B38`)**: High-contrast body, data tables, and transactional text.
- **Muted Slate (`#68778A`)**: Table column headers, field descriptors, microcopy, and inactive step indicators.
- **Surface Canvas (`#F5F7FA`)**: The foundational cool grey app canvas.
- **Card/Table Surface (`#FFFFFF`)**: Pure white data containers providing maximum separation from the structural canvas.
- **Structural Border (`#E2E7ED`)**: Clean structural borders defining records, split views, and inline cells.

### Functional Status Indicators
Status indicators rely on disciplined saturation—tinted backgrounds paired with deep, high-contrast text to preserve readability in data-dense grids:
- **Completed / Approved / Paid**: Background `#E6F5F0`, Text/Border `#0F6B4F`
- **Pending / In Review**: Background `#FEF7EA`, Text/Border `#965E00`
- **Overdue / Critical / Rejected**: Background `#FCEEEF`, Text/Border `#A82229`
- **In Progress / Processing**: Background `#EEF4FA`, Text/Border `#155A9C`
- **Draft / Inactive**: Background `#F0F3F6`, Text/Border `#5A6878`

## Typography

Typography prioritizes tabular legibility, vertical rhythm, and information throughput. Headings remain compact to eliminate wasted vertical headroom on operational dashboards.

- **Inter**: Governs all user interface elements, labels, editorial directives, inputs, and standard data presentations. The neutral grotesque geometry prevents eye fatigue during sustained administrative reviews.
- **JetBrains Mono**: Assigned to institutional reference codes, candidate index numbers, national identification numbers (NIN), system timestamps, verification hashes, and audit ledger entries. Its strict monospaced tracking prevents visual drift during verification passes.

## Layout & Spacing

The layout operates on a fluid enterprise grid anchored to an 8px base rhythm, with 4px sub-increments for high-density components (data tables, split inspectors, status ribbons).

### Structure
- **Desktop (1280px+)**: Multi-pane split architecture with a fixed collapsible rail navigation (240px wide, collapsing to 64px icon-only), an expansive operational workspace spanning 12 fluid columns (`gutter: 1rem`), and an optional contextual inspection sidebar (360px).
- **Tablet (768px - 1279px)**: 8-column layout with auto-collapsing navigation rail and flyout drawers for secondary contextual inspectors.
- **Mobile (< 768px)**: 4-column single-stack view with fixed top header, horizontal overflow tabs, and sticky bottom utility action bar.

Margins are tightly bounded (`1.5rem` desktop, `1rem` mobile) to maximize the active data horizon and minimize dead space around working registers.

## Elevation & Depth

Visual hierarchy is maintained predominantly through structural segmentation, precise low-contrast borders (`#E2E7ED`), and disciplined tonal layering rather than dramatic drop shadows.

- **Level 0 (Base Canvas)**: Background `#F5F7FA`. Un-elevated root plane.
- **Level 1 (Structural Containers / Data Cards)**: Pure white `#FFFFFF` surface bounded by a continuous 1px `#E2E7ED` border. No shadow; separation is achieved by tonal shift against the canvas.
- **Level 2 (Dropdowns, Popovers, Filter Trays)**: Surface `#FFFFFF`, 1px `#E2E7ED` border, reinforced with a subtle, tight institutional shadow: `0 4px 12px -2px rgba(23, 54, 93, 0.08), 0 1px 3px 0 rgba(23, 54, 93, 0.04)`.
- **Level 3 (Modal Dialogues & Verification Overlays)**: Surface `#FFFFFF`, 1px border `#E2E7ED`, elevated by `0 12px 32px -4px rgba(32, 43, 56, 0.16)`. Accompanied by a semi-opaque backdrop scrim (`rgba(23, 54, 93, 0.40)` with `4px` blur) to focus attention on security-sensitive actions.

## Shapes

The design system enforces a restrained corner treatment:
- **Base Components (Inputs, Buttons, Badges, Table Rows)**: 0.25rem (`4px`). Conveys technical precision, institutional structure, and high tabular compatibility.
- **Containers & Data Cards**: 0.5rem (`8px`) for outer boundaries to preserve soft boundaries without introducing decorative softness.
- **Flyouts & Modals**: 0.75rem (`12px`) outer shell for clean separation over backdrop scrims.
- **Badges & Micro-tags**: 0.125rem (`2px`) to 0.25rem (`4px`) maximum; circular pill shapes are avoided to keep badges looking like structured data tags rather than consumer chips.

## Components

### Buttons
- **Primary**: Deep Navy (`#17365D`) fill, white text, 4px border radius. Height: 36px (compact default) or 32px (table-inline). Hover: `#112845`. Focused: 2px ring `#168C88` with 1px white offset.
- **Secondary**: Pure white fill, 1px `#E2E7ED` border, `#202B38` text. Hover: `#F5F7FA` surface, `#17365D` text.
- **Destructive**: White surface, 1px `#F0C4C7` border, `#A82229` text. Hover: `#FCEEEF` fill.
- **Tertiary / Ghost**: Transparent fill, `#52677F` text. Hover: `#F0F3F6` background.

### Input Fields & Controls
- Height: 36px. Border: 1px `#E2E7ED`. Background: `#FFFFFF`. Padding: `0.5rem 0.75rem`. Text: `#202B38` 13px. Placeholder: `#68778A`.
- Active / Focus: Border changes to `#17365D` with an external 2px `#168C88` halo at 20% opacity.
- Disabled: Background `#F5F7FA`, text `#68778A`, border `#E2E7ED`.

### Data Grids & Tables
- Dense horizontal tabular layout. Row height: 40px (default), 32px (compact audit mode).
- Header row: `#F5F7FA` background, 11px uppercase `Inter` bold with `#68778A`, separated by a 1px solid `#E2E7ED` bottom border.
- Cell padding: `0.5rem 0.75rem`. Font size: 13px. Alternating row zebra striping is rejected in favor of a subtle row hover (`#F8FAFC`).
- Numerical and tracking columns use `JetBrains Mono` with tabular numerals (`tnum`) right-aligned.

### Status Chips & Badges
- 20px fixed height, 4px border-radius, font size 11px (bold, medium tracking).
- Structure: Soft background fill, matching 1px border, high-contrast text (e.g., Paid: `#E6F5F0` background, `#0F6B4F` border and text).
- Includes an optional 6px circular indicator dot to reinforce accessibility across varied display configurations.

### Checkboxes & Radio Controls
- 16px × 16px square (checkbox) or circle (radio) with 1px `#52677F` border.
- Checked state: `#17365D` fill with crisp white vector glyph; no gradient or spring bounce animations.

### Specialized EBMIS Institutional Components
- **Candidate Verification Strip**: A standardized identity ribbon featuring a fixed 48px × 48px biometric/photo thumbnail, candidate full name, monospaced National Index Number, and validation watermark.
- **Examination Audit Trail Tile**: Monospaced event log with 1px vertical rule connecting operational check-ins, examiner sign-offs, and result entry timestamps with micro status pills.
- **Secure Seal Banner**: Used at the head of transcripts and verified returns. Displays a muted teal `#168C88` border, tamper-evident verification code in `JetBrains Mono`, and cryptographic status badge.