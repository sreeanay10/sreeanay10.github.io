# FOLLOWLY

A private Instagram follow-back analyzer. It runs entirely in the browser: no login, no server, no tracking.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # analysis engine + parser tests
npm run build    # static build in dist/
```

`dist/` is a static single-page app. When you host it, rewrite unknown paths to `index.html`.

## What's inside

**The Analytics:** Overview, Not following back, Mutual, Followers you don't follow, Excluded, Needs review, Account activity (compare any two snapshots, with a before/after view), Analytics, and an Instagram audit (PDF and CSV).

**The Universe**
- *Social Universe:* a 3D constellation built with Three.js, with a 2D view, search, filters and circle highlighting.
- *Connection Web:* only relationships your export proves are drawn.
- *Constellations:* your own circles.
- *World Map:* only countries you add.

**The Archive**
- *Social Replay:* animated playback between snapshots.
- *Followly Wrapped:* story slides with PDF and image export.
- *Social DNA*
- *Memory Vault:* name, annotate, compare and delete snapshots.
- *Network Fingerprint:* generative art, plus wallpapers and sharing.
- *Account Museum:* collections.
- *Watchlist:* with a per-account relationship detective.

**Everywhere:** Smart Search (⌘K) answers plain-English questions using only your data. A data health check runs on every import.

**Interface:** Liquid Glass surfaces that really refract the page behind them (Chromium browsers; others get a frosted fallback). It also uses springs, droplet indicators and circular page transitions, all honouring reduced motion.

## How it works

| Layer | File |
| --- | --- |
| ZIP / JSON / HTML import (split followers files, both Instagram JSON shapes, HTML exports, nested ZIPs) | `src/lib/parse.ts` |
| Analysis engine: following − followers, mutuals, classification, snapshot diffs | `src/lib/analysis.ts` |
| Metadata providers (manual confirmations, CSV/JSON import) | `src/lib/metadata.ts` |
| On-device storage (IndexedDB snapshots, localStorage metadata/settings) | `src/lib/storage.ts` |
| CSV / PDF export | `src/lib/export.ts` |
| Country normalisation and per-country totals | `src/lib/geo.ts` |
| Map geometry (Natural Earth via world-atlas, bundled; no network calls) | `src/lib/geoShapes.ts`, `src/lib/geo-centroids.json` |
| Spring physics for gestures (damping ratio + response, velocity handoff, momentum projection) | `src/lib/spring.ts` |
| Relationship timelines, Wrapped | `src/lib/history.ts` |
| Smart Search (rule-based, on-device) | `src/lib/smartSearch.ts` |
| Data health check | `src/lib/health.ts` |
| Network layouts / generative fingerprint | `src/lib/layout.ts`, `src/lib/fingerprint.ts` |
| Liquid Glass refraction (per-element SVG displacement lens) | `src/components/liquid.tsx` |

### Classification rules

A non-follow-back account is:

- **Excluded** if it is verified, or has **more than** 100,000 followers. Exactly 100,000 is not excluded.
- **Not following back** only if it is confirmed as not verified with a known count of 100,000 or fewer, or the user confirmed it as a regular account.
- **Needs review** otherwise. Instagram's export has no follower counts or badges, so nothing is assumed.

To add a new metadata source, such as an authorised Graph API lookup, implement `MetadataProvider` in `src/lib/metadata.ts`.

### Follower World Map

Instagram's export contains no locations, and FOLLOWLY never infers one from a username or profile link. Countries come only from:

- the **Country** field in an account's details, or
- a metadata import with `username` and `country` columns. `JP`, `JPN`, `Japan` and `"Paris, France"` are all accepted, and only the country is kept.

Only country-level data is stored. The map shows totals by default, and usernames appear only when you open a country. You can turn the map off in Settings, which also hides the country fields and makes imports ignore locations. "Delete location data" removes every stored country.

`src/lib/geo-centroids.json` holds one representative point per country. It was derived from world-atlas `countries-50m.json` by taking the centroid of the largest polygon across all features that share an ISO numeric id. It lets small states such as Singapore and Hong Kong be marked even though the 1:110m shapes leave them out.
