# Handoff: Dunigan Family Recipe Book (mobile app)

## Overview
A mobile app that holds the Dunigan family's recipe box. Each recipe page puts **family stories first**: anyone in the family can add a memory about a dish, and every story is kept and listed. Below the stories are the typed recipe (with ingredient checkboxes and a step-by-step cook mode with timers) and then photos of the original handwritten card (front and back, tap to enlarge). There is also a Family view (recipes grouped by whose kitchen they came from), a Book view (Mom's note, print/export a PDF book) and an Add Recipe flow (photograph or type a card). The app is used by the whole family, from grandparents to grandkids, on both iOS and Android.

Repo target: `GrizzlyPNW/DuniganRecipes` (empty at handoff time).

## About the Design Files
The `.dc.html` files here are **design references built in HTML**. They are working prototypes that show the intended look and behavior; they are not production code. Rebuild them in a real stack. Recommended, since there's no existing codebase:
- **App:** a PWA in React + Vite + TypeScript (one codebase for iOS and Android, installable with "Add to Home Screen"). Wrap it with Capacitor later if you want app-store builds. Expo/React Native is a fine alternative.
- **Backend:** Supabase or Firebase for shared stories, recipe edits, auth by family invite link, and image storage. In the prototype, stories are saved only to `localStorage`. **They must become shared and synced.**
- **Hosting:** GitHub Pages, Vercel, or Netlify.

Open `All Screens.dc.html` in a browser (serve the folder, e.g. `npx serve .`) to see all 11 screens side by side. `index.html` is the same app full-screen. `Recipe App.dc.html` is the single source with all markup and logic.

## Fidelity
**High-fidelity.** Final colors, type, spacing, copy and interactions. Recreate them closely.

## Screens / Views
All screens are 390×844 (iPhone 14 reference). Page background `#f7f2e8`. Content side padding 22px.

### 1. Recipes (home)
- **Menu button**: fixed top-left (top 52, left 16), 44×44 circle, `#fffdf8`, 1px border `rgba(43,37,33,.14)`, three 18×2 bars `#2b2521`.
- Content starts at y=108.
- Eyebrow: "THE DUNIGAN KITCHEN", Instrument Sans 600 11px, letter-spacing .14em, `#a24a2a`.
- H1: "What are we cooking today?", Newsreader 500 32/1.1.
- Search field: height 48, radius 14, bg `#fffdf8`, border `rgba(43,37,33,.14)`, placeholder "Search recipes, cooks, ingredients", 16px. Matches title, contributor name, and ingredients.
- Mom's note card (hidden while searching): bg `#efe7d8`, radius 16, padding 16/18; italic Newsreader 17/1.45 quote "From my kitchen to yours, these recipes hold so much more than ingredients."; sub "Mom's note · open the book →" 12px `#6f645a`. Tap → Book.
- "WHOSE KITCHEN?" row: horizontal scroll of 54px avatar circles (initials, Newsreader 17) with first name below (12px). The colors per person are `oklch(0.87 0.06 H)` bg and `oklch(0.38 0.09 H)` text (hues in recipes.json). Selected: double ring `0 0 0 3px #f7f2e8, 0 0 0 5px #a24a2a`. Tap toggles a contributor filter.
- Category chips: horizontal scroll, height 36, radius 18. Default is a transparent fill with a `rgba(43,37,33,.2)` border; selected is `#2b2521` bg with `#f7f2e8` text. The first chip is "All 39".
- Active contributor banner: "From the kitchen of **Name**" + "Clear".
- List header: title (Newsreader 20) + count ("N cards").
- Recipe row: card photo thumbnail 68×52, radius 6, rotated −1.5°, small shadow. Title Newsreader 500 18; sub "Contributor · Category", or "Card only · needs typing" when untyped. Right: "N stories" in `#a24a2a` when there are any. Divider `rgba(43,37,33,.1)`.
- Empty state: italic "Nothing in the box matches that yet."

### 2. Menu (left drawer)
- Scrim `rgba(31,27,24,.45)`; drawer 290px wide from the **left**, bg `#f7f2e8`, shadow `10px 0 30px rgba(0,0,0,.2)`.
- Header eyebrow "THE DUNIGAN KITCHEN" + 40px close circle.
- Items (Newsreader 22 + 13px sub), current one in `#a24a2a`:
  - Recipes: "39 cards in the box"
  - Family: "Whose kitchen it came from"
  - **Book**: "Mom's note · print a copy". Book is reached **only** from this menu.
  - Add Recipe: "Photograph or type a card"

### 3. Search
- The same home layout with a query filled in. Browse sections are hidden; the list title becomes "Results".

### 4. Recipe page (typed recipe)
Order from top: header → **Family stories** → The recipe → Original card.
- Sticky top fade (100px gradient) and a "‹ Recipes" pill (top 52, left 16, h40, `#fffdf8`, shadow).
- Category eyebrow, H1 Newsreader 500 34/1.08, contributor row (30px avatar + "From the kitchen of Name"; "Not signed · know who wrote it?" when unknown). Tapping it filters home by that person.
- Two buttons (2-col grid, h48, radius 14): "Go to recipe ↓" (filled `#a24a2a`) and "See the card ↓" (outline). Each scrolls to its section.
- **Family stories**: H2 Newsreader 26 + count; helper "Who made it, when, and what you remember. Anyone in the family can add one."
  - Story card: `#fffdf8`, 1px border, radius 16, padding 16; text Newsreader 18/1.45 (pre-wrap); footer with a 24px initials circle (`#e9d6c8`/`#7d3519`), the name (600 13) and "· relative time".
  - Newest first. Empty: "No stories yet. Be the first to share one."
  - Add form box (`#efe7d8`, radius 16): Name input (h46) and a textarea (3 rows, Newsreader 17, "Share a memory about this recipe…"). The "Add my story" button (h50) is `#a24a2a` when both fields are filled and `#b9a999` otherwise. Validation toasts: "Add your name first" / "Write a few words first". The name is remembered on the device.
- **The recipe**: H2 26. Meta strip (Oven / Time / Makes), with cells divided by 1px lines. Optional "Note on the card" box (`#efe7d8`). The Ingredients list has 22px checkboxes (checked: `#a24a2a` fill, ✓, strikethrough, text `#8a7f74`) and an "N of M gathered" counter. The numbered Method uses Newsreader 22 numerals in `#a24a2a` and Instrument Sans 17/1.5 text. CTA "Start cooking · step by step" (h56, `#a24a2a`).
- **The original card**: "THE ORIGINAL CARD" label + hint. Horizontal snap row of 170×130 photos (radius 8, shadow), labelled "Front of card" / "Back of card" / "Card". Tap opens the lightbox.

### 5. Recipe page (card not typed yet)
- The same page, but the recipe section is replaced by a dashed box: "This card hasn't been typed up yet" / "Read the card above and type it in so it's searchable and works in cook mode." Button: "I'll type it up". The first header button reads "Help type it ↓".

### 6. Card lightbox
- Full-screen `#14110f`. Top row: "Title · front/back" and "Close ✕". The image uses contain-fit. A "Flip card ↻" pill appears when there are two sides. Tapping anywhere closes it.

### 7. Cook mode
- Dark: bg `#2b2521`, text `#f7f2e8`, accent `#e59a78`.
- Top: close circle, title, "n/N". Segmented progress bars (4px, filled `#e59a78`).
- "STEP n" eyebrow; step text Newsreader 30/1.32.
- **Auto timer**: if the step text contains a duration ("12 min", "1 hour", "1¼ hrs", "½ hr"), show a "Start 12 min timer" pill. Running, it shows a big mm:ss with Pause/Resume and ↺ reset, and fires a "Timer done" toast at 0.
- Bottom: Back (1fr, outline; faded at step 1) and "Next step"/"Finish" (2fr, filled `#e59a78`), both h60.

### 8. Finished
- "ALL DONE" / "Enjoy every bite." (Newsreader 46) / "Title, from the kitchen of Name." Buttons: "Add a story about today" (returns to the recipe at its top, where the stories are) and "Back to recipe".

### 9. Family
- "Whose kitchen it came from". Rows: 48px avatar, "Name · relation", "N recipes". Tapping a row filters home. A dashed callout says "N cards aren't signed".

### 10. Book (menu only)
- A 220×290 cover mock (`#6d2e1a`, spine inset shadow) reading "A Family Recipe Book / Collected with love over 50 years / FIRST EDITION".
- Mom's full note.
- Toggles for each page: Original card photos / Typed recipe / Family stories.
- "Export PDF for printing" button.

### 11. Add Recipe
- "Add a card to the box". Two large options:
  - "Photograph a card" (dark): shoot the front, then the back.
  - "Type it in" (light).

### Bottom bar (home and family)
- Height 84, top border. Grid columns 1fr / 1.5fr / 1fr: "Recipes" · a **"+ Add Recipe"** pill (h46, `#2b2521`, 600 15px) · "Family". Active tab: `#2b2521` text with a 5px `#a24a2a` dot; inactive `#8a7f74`.

### Toast
- Bottom 100, inset 22, `#2b2521`, radius 14, 14px. Auto-hides after 2.4 seconds.

## Interactions & Behavior
- Opening a recipe resets ingredient checks and scrolls the page to the top.
- The stories form validates on submit. On success, the story is added and the textarea clears.
- The timer resets when you change steps.
- The **Export PDF** button, the Add Recipe camera, and "I'll type it up" are stubs in the prototype. Build them for real:
  - Camera: a file input with `capture`, front then back, uploaded to storage.
  - Transcription form: optionally OCR-assisted.
  - PDF: one page per recipe with the cover and Mom's note first, honoring the toggles.

## State / Data Model
- `Contributor { id, name, relation?, hue }`
- `Recipe { id, title, category, contributorId, cardImages[], temp?, time?, makes?, note?, ingredients[]?, steps[]? }`. A recipe is "typed" when it has ingredients.
- `Story { id, recipeId, authorName, text, createdAt }`. Needs a backend so the whole family shares it. Consider simple family auth (an invite link) plus a display name.
- UI state: tab, open recipe, cook step, timer, search query, category/contributor filters, lightbox, menu open.

## Design Tokens
- Paper `#f7f2e8`, card `#fffdf8`, tint `#efe7d8`, ink `#2b2521`, muted `#6f645a` / `#5f554c` / `#8a7f74`.
- Accent terracotta `#a24a2a` (hover `#7d3519`), cook-mode accent `#e59a78`, lines `rgba(43,37,33,.08–.2)`.
- Type:
  - **Newsreader** (Google): headings and reading text, 500/400 and italic.
  - **Instrument Sans**: UI, 400/500/600.
  - Scale: 11 eyebrow · 12–14 meta · 15–17 body · 18–22 titles · 24–26 H2 · 30–34 H1 · 46 hero.
- Radii: 6–8 photos · 12–14 inputs/buttons · 16–20 cards · 18/23 pills · 48 device.
- Minimum tap target: 44px.

## Assets
- `uploads/`: 66 photos of the original recipe cards supplied by the family. Front/Back are paired by filename.
- `recipes.json`: all 39 recipes with contributors and categories. 15 are fully typed; the rest are card-only.
- Recipes were typed from the family Google Doc and read from the card photos.
- Uncertain readings to confirm with the family:
  - "Vaunie Gains" (Applesauce Bars, Apple Slices).
  - Whether Jeanette Russell is "Mom (Jeanette)" from the doc.
- The full doc lists about 176 recipes; only those with card photos are included so far.

## Files
- `Recipe App.dc.html`: the complete prototype (markup plus logic class with the data).
- `All Screens.dc.html`: all 11 screens side by side.
- `index.html`: the same app, full-screen.
- `support.js`: the runtime needed to open the `.dc.html` files.
- `recipes.json`, `uploads/`: data and images.
