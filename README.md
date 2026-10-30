# The Dunigan Kitchen

The Dunigan family recipe box as an installable phone app (PWA): 39 recipes, photos of the original cards, family stories, step-by-step cook mode with timers, and a printable book.

Built with React + Vite + TypeScript. Hosted on Vercel. Shared stories and recipe edits live in a Neon Postgres database; new card photos go to Vercel Blob.

## Run it on your computer

```bash
npm install
npm run dev
```

Open http://localhost:5173. Without a database the app runs in "this device only" mode: stories and edits are saved in the browser.

## How it fits together

| Part | Where |
| --- | --- |
| Screens | `src/components/` (Home, RecipePage, CookMode, Family, Book, AddRecipe) |
| Recipe data | `src/data/recipes.json` (built from `design/recipes.json`) |
| Card photos | `public/cards/` (compressed from the full scans in `originals/`, which stay out of git) |
| Shared data API | `api/family.ts`, one Vercel function for stories, recipe edits and photo uploads |
| Design reference | `design/` (the original HTML prototype and handoff notes) |

To re-make the compressed card photos and app icons after changing the scans: `npm run images`.

## Going live (Vercel)

1. Import the GitHub repo in Vercel. It detects Vite automatically.
2. In the project's **Storage** tab, connect a **Neon** database (adds `DATABASE_URL`) and a **Blob** store (adds `BLOB_READ_WRITE_TOKEN`).
3. In **Settings → Environment Variables**, add `FAMILY_CODE`: a long secret phrase.
4. Redeploy. The tables are created automatically on first use.

## Inviting the family

Send this link: `https://<your-site>/#/join/<FAMILY_CODE>`

Opening it once on a phone unlocks stories, editing and adding cards on that phone. To install the app: Safari → Share → **Add to Home Screen** (iPhone), or Chrome → ⋮ → **Install app** (Android).

To lock everyone out (say the link got forwarded too far), change `FAMILY_CODE` in Vercel, redeploy, and send the new link.
