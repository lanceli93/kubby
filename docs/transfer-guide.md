# Project Transfer Guide

Transfer the project to another computer while preserving git history.

## What to exclude

| Directory | Size | Reason |
|---|---|---|
| `node_modules/` | ~661M | Reinstall with `npm install` |
| `.next/` | ~820M | Regenerate with `npm run build` |
| `dist/` | ~338M | Packaging output |
| `.download-cache/` | ~189M | Packaging download cache |
| `data/` | ~41M | Runtime data (actor photos, db, config) |
| `kubby.db` | - | SQLite database |

## What to keep

- `.git/` (~26M) — contains all commit history
- All source code (`src/`, `launcher/`, `installer/`, `scripts/`, etc.)
- Config files (`package.json`, `tsconfig.json`, `next.config.ts`, `drizzle.config.ts`, etc.)
- `docs/`, `public/`, `drizzle/`

Compressed size: ~30MB.

## Zip command

```bash
cd /path/to/parent/directory

zip -r ~/Desktop/kubby.zip kubby/ \
  -x "kubby/node_modules/*" \
     "kubby/.next/*" \
     "kubby/dist/*" \
     "kubby/.download-cache/*" \
     "kubby/data/*" \
     "kubby/kubby.db" \
     "kubby/.DS_Store"
```

## On the target computer

```bash
unzip kubby.zip
cd kubby
npm install
npm run build   # optional, only if you want to verify
```

Then push to GitHub:

```bash
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```
