# Vela Design System

**Vela** is the design system for the Vela desktop download manager — a Windows 11-native application for downloading video (MP4) and audio (MP3) from online sources. The name references the constellation "Vela" (the Sails), suggesting calm velocity.

> This design system was created from scratch; no external codebase, Figma file, or existing brand assets were provided. All tokens, components, and visual foundations are purpose-built for this product.

---

## Product Context

**Vela** is a single-product desktop application targeting Windows 11. It allows users to:
- Paste video/playlist URLs and download them as MP4 (video) or MP3 (audio)
- Track download progress in a live queue
- Handle playlists (merged or individual tracks)
- Configure output folder, quality, and concurrency

The UI surface is a single main window with three tabs: Downloads, History, Settings.

---

## Content Fundamentals

**Voice & tone:** Calm, efficient, technical. The app speaks like a knowledgeable tool — never chatty, never curt. Uses sentence case for UI labels, Title Case only for tab names and section headings. No exclamation marks; no "amazing" or "awesome."

**Language:**
- Second-person ("Your downloads", "Configure your folder") or impersonal ("No downloads yet.")
- Short, scannable labels. "Add to queue" not "Click here to add your video to the download queue."
- Metadata uses numerical precision: "1.8 GB", "2.4 MB/s", "03:42 remaining"
- Status messages: "In queue", "Downloading…", "Complete", "Failed — click retry"

**Casing:** Sentence case for labels, action text, hints. UPPERCASE + letter-spacing for eyebrow/section labels only (e.g. "QUEUE", "PLAYLIST MODE"). No ALL CAPS in body copy.

**Emoji:** Never used. The product is a technical desktop tool; emoji would undermine the professional tone.

**Numbers/data:** Monospaced font (JetBrains Mono) for all numeric data: filesizes, speeds, percentages, durations. This prevents layout jitter as values update.

---

## Visual Foundations

### Colors
Dark-first palette. The canvas is a deep **slate-blue** (`--vela-bg: oklch(0.15 0.016 257)`) — cool, slightly blue-tinted, noticeably different from pure black. Two accent families:
- **Teal** (`--vela-primary: oklch(0.72 0.12 195)`) — primary actions, video format, progress bars. Reads as a calm blue-green.
- **Indigo** (`--vela-secondary: oklch(0.66 0.14 275)`) — secondary actions, audio format. Reads as medium purple-blue.

Semantic status colors: teal-300 success, amber-ish warning, warm red danger.

The app uses a **Mica-like** radial gradient overlay (`--vela-mica`) that adds subtle teal/indigo tints to corners — similar to Windows 11's acrylic/mica material.

### Typography
- **Hanken Grotesk** (Google Fonts): All UI text. Chosen for its legibility at small sizes and its slightly technical character. Loaded via `@import` in `tokens/fonts.css`.
- **JetBrains Mono**: All numeric data, URLs, file paths. Makes the app feel like a technical tool. Also loaded via fonts.css.
- Base size: **14px** (desktop density). Scale steps: 11, 12, 13, 14, 15, 17, 20, 24, 30, 38, 48px.
- Weights used: 400 (body), 500 (labels, data), 600 (headings, buttons), 700 (titles), 800 (display).

### Spacing
Strict **4px grid**. Token range: 4, 8, 12, 16, 20, 24, 28, 32, 40, 48, 64, 80px. All components use `--space-*` or equivalent pixel values from the grid.

### Corner Radii
Friendly but not bubbly. Key radii:
- `--radius-xs: 4px` — chips, small badges
- `--radius-sm: 6px` — small buttons, checkboxes
- `--radius-md: 10px` — standard buttons, inputs, cards
- `--radius-lg: 14px` — large inputs (URL bar), modals
- `--radius-xl: 18px` — main content cards
- `--radius-full: 999px` — pills, progress tracks, switches

### Cards & Surfaces
Three surface levels above the canvas background:
1. `--vela-surface` (slate-900): panels, primary cards — e.g. the input card
2. `--vela-surface-2` (slate-850): raised rows, list items — e.g. DownloadRow
3. `--vela-surface-3` (slate-800): inputs, interactive fills, hover state of surface-2

Cards use `--shadow-sm` + `1px solid var(--vela-border)`. No heavy drop shadows; darkness provides depth. Top edge highlight (`--edge-highlight: inset 0 1px 0 oklch(1 0 0 / 0.05)`) on primary buttons to sell the raised look.

### Backgrounds & Textures
No images or textures. Background is flat `--vela-bg` with the Mica gradient overlay. No full-bleed photos. The app window chrome uses a translucent blur (`backdrop-filter: blur(20px)`) on the titlebar.

### Animation & Motion
- **Philosophy:** Motion is functional, never decorative. Transitions communicate state change, not personality.
- **Durations:** 80ms (instant), 120ms (fast hover/press), 200ms (base transitions), 240ms (enter), 160ms (exit), 320ms (slow).
- **Easing:** `ease-out` for most transitions (enter = decelerate). Spring (`cubic-bezier(0.34, 1.56, 0.64, 1)`) only for micro-interactions (switch thumb, scale on click).
- **Progress bars:** 350ms ease-out for incremental updates; sweep animation for indeterminate/queued state.
- No looping decorative animations. Download row spinner is functional (loading state).

### Hover & Press States
- **Hover:** Lighter background (`--vela-surface-3` → `--vela-overlay`), or color shift (+1 step). Never opacity change on buttons.
- **Press/Active:** `transform: translateY(0.5px) scale(0.985)` + darker background. Gives tactile feedback.
- **Focus:** `box-shadow: 0 0 0 3px var(--vela-focus)` — a semi-transparent teal ring. Consistent across all interactive elements.
- **Disabled:** `opacity: 0.45` + `pointer-events: none`. Never hides the element.

### Icons
Lucide-style: 24×24px grid, 2px stroke, round linecap/linejoin. Inline SVG throughout — no icon font. Icons are always the same color as their parent text context. Size variants: 14px (dense UI), 15-16px (standard buttons), 17-18px (large buttons), 20-24px (empty states).

### Borders
`1px solid var(--vela-border)` is the standard. `--vela-border: oklch(0.34 0.02 257 / 0.65)` — slightly transparent so it blends with varying backgrounds. Strong variant for focused/active states: `--vela-border-strong`. Subtle variant for dividers: `--vela-border-subtle`.

### Shadows
All shadows use `oklch(0 0 0 / opacity)` — pure black at varying opacity. Dark mode requires heavier shadows to create contrast (0.30–0.50 opacity range). Accent glow on primary/secondary buttons adds energy without being garish.

### Transparency & Blur
Used sparingly:
- Titlebar only: `backdrop-filter: blur(20px)` over Mica gradient
- Soft tint fills (`--vela-primary-soft`, `--vela-secondary-soft`) for badge backgrounds and hover fills
- No other blur effects in the UI

### Color of Imagery
No photos in the UI. If future imagery is added: cool, desaturated tones preferred. No warm grain. Think blue-shifted editorial photography.

---

## Iconography

Vela uses **inline SVG Lucide-style icons** only. No icon fonts, no PNG icons, no emoji.

**Icon system:**
- Style: Outline strokes, 2px strokeWidth, round strokeLinecap + strokeLinejoin
- Grid: 24×24 viewBox
- Sizes in use: 14–17px (context-dependent, scaled via `width`/`height` on the SVG element)
- Color: Always inherits `currentColor` from parent — never hardcoded fill

**Key icons used:**
- Download: arrow-down-to-tray (download action, app logo motif)
- Video: film/camera icon (📹 metaphor, but SVG)
- Audio: music note / headphone
- Paste: clipboard icon (UrlBar paste button)
- Trash: delete icon (remove from queue)
- Retry: rotate-ccw (error retry)
- Folder: folder icon (open destination)
- Settings: gear/cog
- Minimize/Maximize/Close: Windows 11 native-style SVG lines

**Do not use:** emoji as icons, Unicode symbols as decorative elements, or Font Awesome.

**CDN alternative:** If Lucide Icons CDN is available, link `https://unpkg.com/lucide@latest` and use `<i data-lucide="download">` pattern. But inline SVG is the default.

---

## Index

```
/
├── styles.css              ← Global entry point (imports only)
├── readme.md               ← This file
├── SKILL.md                ← Agent skill descriptor
│
├── tokens/
│   ├── colors.css          ← Teal/indigo palette + semantic aliases
│   ├── typography.css      ← Hanken Grotesk + JetBrains Mono scales
│   ├── spacing.css         ← 4px grid, radii, control heights, layout vars
│   ├── elevation.css       ← Shadows, rings, glows
│   ├── motion.css          ← Durations + easing tokens
│   ├── fonts.css           ← @font-face + Google Fonts @import
│   └── base.css            ← Minimal resets, .vela-root, .vela-data, .vela-eyebrow
│
├── assets/
│   ├── vela-mark.svg       ← Primary logo mark (dark background)
│   ├── vela-mark-mono.svg  ← Monochrome logo (light backgrounds)
│   └── vela-wordmark.svg   ← "VELA" wordmark SVG
│
├── cards/                  ← Foundation specimen cards (Design System tab)
│   ├── colors.card.html    ← Teal/indigo/slate scales + semantic swatches
│   ├── typography.card.html← Type scale + mono specimens
│   ├── spacing.card.html   ← Spacing scale, radii, control heights
│   ├── shadows.card.html   ← Shadow scale + focus rings + glows
│   ├── motion.card.html    ← Duration/easing tokens
│   └── brand.card.html     ← Logo assets + gradient specimens
│
├── components/
│   ├── core/               ← Button, IconButton (+ card)
│   ├── forms/              ← Input, SegmentedControl, Switch, Checkbox, Select (+ card)
│   ├── feedback/           ← ProgressBar, Badge, Spinner (+ card)
│   └── app/                ← UrlBar, FormatToggle, PlaylistMode, DownloadRow (+ card)
│
└── ui_kits/
    └── vela_app/
        └── index.html      ← Full interactive app prototype (Windows 11)
```

### Components quick reference

| Component | Group | Description |
|---|---|---|
| `Button` | core | Primary, secondary, neutral, ghost, soft, danger variants; sm/md/lg sizes |
| `IconButton` | core | Square icon-only button; solid/ghost; active/danger states |
| `Input` | forms | Text field with label, prefix/suffix icons, error, hint |
| `SegmentedControl` | forms | Tab-style option picker; primary/secondary color |
| `Switch` | forms | Animated toggle with spring thumb |
| `Checkbox` | forms | Checkbox with indeterminate state |
| `Select` | forms | Styled native select with custom arrow |
| `ProgressBar` | feedback | Animated progress; gradient/primary/secondary/success/danger; indeterminate |
| `Badge` | feedback | Semantic status pill; video/audio format variants |
| `Spinner` | feedback | Circular SVG spinner; xs/sm/md/lg |
| `UrlBar` | app | URL input with paste-from-clipboard button; clears to empty |
| `FormatToggle` | app | MP4/MP3 two-option toggle with format badges |
| `PlaylistMode` | app | Single-file vs individual-tracks radio cards |
| `DownloadRow` | app | Download list entry with progress, status, actions |
