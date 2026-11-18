# FOLLOWLY

See who doesn't follow you back on Instagram. Everything runs in your browser: no login, no password, no server.

## How to use it

1. In Instagram, open **Settings and activity → Accounts Center → Your information and permissions → Download your information**.
2. Choose **Some of your information → Followers and following**, **All time**, and **JSON**.
3. Download the ZIP Instagram sends you and drop it into FOLLOWLY. No need to unzip it.

Accounts Center: https://accountscenter.facebook.com/info_and_permissions

## What you get

- **Overview**: followers, following, and the three lists below.
- **Don't follow you back**: following − followers
- **You don't follow back**: followers − following
- **Mutual**: following ∩ followers

Each list has search, links to profiles, copy, and CSV/PDF export.

## Privacy

- The ZIP is read in the browser with JSZip. Nothing is uploaded.
- Only the `followers_*` and `following` files in `connections/followers_and_following/` are read.
- Your import lives only in the current tab, and is cleared when you close it or press **Clear all data**.
- FOLLOWLY never follows or unfollows anyone.

## Run

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # parser and comparison tests
npm run build   # static build in dist/
```

Pushing to `main` deploys to GitHub Pages (`.github/workflows/deploy.yml`).

## Code

| Part | File |
| --- | --- |
| ZIP / JSON / HTML import | `src/lib/parse.ts` |
| Comparison (Sets) | `src/lib/analysis.ts` |
| Import health checks | `src/lib/health.ts` |
| Session storage | `src/lib/storage.ts` |
| CSV / PDF export | `src/lib/export.ts` |
| Pages | `src/pages/` |
