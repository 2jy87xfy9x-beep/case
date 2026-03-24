# Multi-Device Support — Implementation Report
**Date:** March 24, 2026
**Branch:** `claude/multi-device-support-ZEhz1`
**Scope:** PWA installability, cross-device data portability, Netlify deploy config

---

## Problem Addressed

The app was local-only: data lived in browser IndexedDB, the only way to run it was `npm run dev:ui` on the development machine, and there was no mechanism to move data to another device. Three gaps prevented multi-device use:

1. No public URL — other devices could not reach the app at all.
2. No PWA manifest — browsers could not offer "Add to Home Screen" installation.
3. No data portability — switching devices meant starting from scratch.

---

## Changes Made

### 1. PWA Manifest (`web/manifest.json`)

Added a Web App Manifest so browsers can install the app via "Add to Home Screen" on iOS and Android:

```json
{
  "name": "Case Organizer",
  "short_name": "Case",
  "display": "standalone",
  "theme_color": "#2d5a3d",
  ...
}
```

- Standalone display mode hides browser chrome (feels native).
- `theme_color` matches the existing app bar colour.
- Two PNG icons generated at 192×512 px (`web/icons/`).

Linked in `web/index.html` alongside Apple-specific meta tags:

```html
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-title" content="Case" />
<link rel="manifest" href="/manifest.json" />
```

Apple's PWA support requires these tags separately from the standard manifest.

---

### 2. JSON Backup / Restore (`web/main.ts` + `web/index.html`)

Added a **"Move to another device"** card in the Export screen with two actions.

#### Download backup (`onBackupDownload`)

Serializes the full Case from IndexedDB to a versioned JSON file and triggers a browser download:

```
case-backup-YYYY-MM-DD.json
```

Payload structure:

```json
{
  "version": 1,
  "exportedAt": "ISO timestamp",
  "case": {
    "id": "...",
    "title": "...",
    "lastExportedAt": "ISO | null",
    "evidence": [ { ...all fields, dateTime as ISO string } ],
    "messages": [ { ...all fields, dateTime as ISO string } ],
    "claims": [...],
    "legalNotes": [...],
    "lawyers": [...]
  }
}
```

All `Date` objects are serialised to ISO 8601 strings. `NaN` dates (evidence with no EXIF date) serialise as `null` and are restored to `new Date(NaN)` to preserve the existing gap-detection contract.

**Images are not included.** Original image files are not stored in IndexedDB — only the extracted/entered text is stored. The disclaimer in the UI notes that images must be re-uploaded after restoring on a new device.

#### Restore from backup (`onBackupRestore`)

Accepts a `.json` file, validates `version === 1` and the presence of `case.id`, re-hydrates all ISO strings back to `Date` objects, then writes to all six IndexedDB stores (`cases`, `evidence`, `messages`, `claims`, `legalNotes`, `lawyers`) before reloading the UI. A live status element (`aria-live="polite"`) reports item counts on success or the error message on failure.

The file input is reset after each attempt so the same file can be re-selected if needed.

---

### 3. Netlify Deploy Config (`netlify.toml`)

Added a root-level `netlify.toml` so the repo can be connected to Netlify with zero manual configuration:

```toml
[build]
  command = "npm run build:ui"
  publish = "dist/web"

[build.environment]
  NODE_VERSION = "22"
```

Security headers applied to all routes:

| Header | Value |
|--------|-------|
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |

`manifest.json` gets `Content-Type: application/manifest+json` to satisfy browser validation.

---

## Files Changed

| File | Change |
|------|--------|
| `web/manifest.json` | New — PWA manifest |
| `web/icons/icon-192.png` | New — 192 px app icon |
| `web/icons/icon-512.png` | New — 512 px app icon |
| `web/index.html` | Added manifest link, Apple meta tags, backup/restore card |
| `web/main.ts` | Added DOM queries, `onBackupDownload`, `onBackupRestore`, event wiring |
| `netlify.toml` | New — build + security headers config |

---

## Architecture Notes

No changes to the domain layer or storage port. The backup/restore logic calls the existing `CaseRepository` methods directly (`saveCase`, `saveEvidence`, etc.), keeping the serialization concern in the UI layer where the other export logic already lives. The `version: 1` envelope in the JSON payload allows a future migration path if the data shape changes.

---

## How to Deploy (one-time)

1. Go to **app.netlify.com → Add new site → Import from Git**.
2. Connect the repository. Netlify reads `netlify.toml` and fills in build settings automatically.
3. Deploy. Every subsequent push to the connected branch redeploys automatically.

Once live, any device that opens the URL can:
- Use the app immediately in the browser.
- Tap **Add to Home Screen** (iOS Safari share sheet; Android Chrome install prompt) to install as a PWA.
- Transfer case data between devices using **Download backup / Restore from backup** in the Export tab.

---

## Known Limitation

Images must be re-uploaded after a restore. This is a consequence of the privacy-first design (images are never written to IndexedDB, only the extracted text). Post-MVP, an encrypted cloud attachment store would remove this step.
