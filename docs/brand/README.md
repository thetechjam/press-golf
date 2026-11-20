# Trunk brand source files

Generated with Higgsfield (GPT Image 2.6) in November 2026 for the Press → Trunk
rename, then cut and resized with `sharp`. `BRAND.md` at the repo root is the
brand guide; this folder keeps the source art. Nothing here is served or bundled.

| Path | What it is |
|---|---|
| `source/higgsfield-original.svg` | The vector mark exactly as Higgsfield returned it (1024 viewBox, taillights `#ed3732`). |
| `source/trunk-mark.svg` | In-app mark: body and ball `currentColor`, flag `#e7b53c`, taillights `#d2483b`. Source of `TrunkMark` and the splash. |
| `source/trunk-mark-cream.svg` | Same mark with a cream `#f4f7f2` body, for felt surfaces. |
| `source/trunk-mark-on-light.svg` | Same mark with a deep green `#0b3d2e` body, for light surfaces. |
| `source/icon-full.svg`, `source/icon-maskable.svg` | Full-square and maskable (mark at 70%) sources for the PNG icons in `public/`. |
| `icon-1024.png` | 1024 px master for stores and marketing. |
| `capacitor/` | Inputs for `@capacitor/assets` if a native shell is created (`icon-only`, `icon-foreground` in the 66% safe zone, `icon-background`, 2732 px splashes). Not used by the web build. |
| `mockups/` | AI mockups of Home, scoring and settle-up used as visual direction. Not a spec; the app's layouts did not change. |
| `runner-up/` | Options that were considered and not picked. |

The shipped files in `public/` (`app-icon.svg`, `favicon.svg`, `icon-192.png`,
`icon-512.png`, `icon-maskable-192.png`, `icon-maskable-512.png`,
`apple-touch-icon.png`, `og.png`) are generated from these sources.
