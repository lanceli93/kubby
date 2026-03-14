# Kubby Release Workflow

Step-by-step process for packaging, testing, and publishing a new Kubby release.

## CI Workflows

| Workflow | File | Trigger | Output |
|----------|------|---------|--------|
| Release | `.github/workflows/release.yml` | `v*` tag push or `workflow_dispatch` | macOS DMGs (arm64 + x64) + Windows exe → GitHub Release (draft) |
| Docker | `.github/workflows/docker.yml` | `v*` tag push or `workflow_dispatch` | `ghcr.io/lanceli93/kubby:{version}` (amd64) |

## Release Steps

### 1. Test packaging on all platforms

```bash
gh workflow run release.yml --field platform=all
```

Wait for all 3 jobs to pass (darwin-arm64, darwin-x64, win-x64). Monitor:

```bash
gh run list --workflow=release.yml --limit 1
gh run watch <run-id> --exit-status
```

If a build fails, check logs with `gh run view <run-id> --log-failed`, fix the issue, push, and re-trigger.

### 2. User testing

Ask the user to download artifacts from the Actions run page and test:

```bash
# Show artifact sizes
gh api repos/lanceli93/kubby/actions/runs/<run-id>/artifacts \
  --jq '.artifacts[] | "\(.name): \(.size_in_bytes / 1024 / 1024 | floor)MB"'
```

The artifacts URL: `https://github.com/lanceli93/kubby/actions/runs/<run-id>`

Wait for user confirmation before proceeding.

### 3. Tag and push

```bash
git tag -a v{x.y.z} -m "v{x.y.z}"
git push origin v{x.y.z}
```

This automatically triggers both `release.yml` (builds all platforms + creates draft release) and `docker.yml` (builds + pushes Docker image).

### 4. Wait for builds

```bash
# Release workflow
gh run list --workflow=release.yml --limit 1
gh run watch <run-id> --exit-status

# Docker workflow
gh run list --workflow=docker.yml --limit 1
gh run watch <run-id> --exit-status
```

### 5. Write release notes

> **IMPORTANT**: Do NOT use `gh release create` — CI already created a draft release with assets in step 3-4. Using `gh release create` will create a **second** release for the same tag (one with assets, one with notes). Instead, always **edit** the existing draft.

Get commits since last release:

```bash
gh release list --limit 1                    # Find previous tag
git log v{prev}..v{new} --oneline            # List changes
```

Update the draft with meaningful content:

```bash
gh release edit v{x.y.z} --notes "$(cat <<'EOF'
## What's New

### Feature Name
Description of the feature.

## Bug Fixes

- Fixed specific bug description

## Downloads

| Platform | File |
|----------|------|
| macOS (Apple Silicon) | `Kubby-arm64.dmg` |
| macOS (Intel) | `Kubby-x64.dmg` |
| Windows | `KubbySetup.exe` |
| Docker | `ghcr.io/lanceli93/kubby:{x.y.z}` |

**Full Changelog**: https://github.com/lanceli93/kubby/compare/v{prev}...v{x.y.z}
EOF
)"
```

### 6. Publish

Edit the draft to add title, notes, and publish in one step:

```bash
gh api -X PATCH repos/lanceli93/kubby/releases/<RELEASE_ID> \
  -f name="v{x.y.z} — Title" \
  -F draft=false \
  -f body="$(cat <<'EOF'
## What's New
...release notes...
EOF
)"
```

To find the draft release ID:

```bash
gh api repos/lanceli93/kubby/releases --jq '.[] | select(.tag_name=="v{x.y.z}" and .draft) | .id'
```

### 7. Verify Docker image

```bash
gh run list --workflow=docker.yml --limit 1
# Confirm the run triggered by the tag completed successfully
```

The Docker image is tagged as both `{version}` and `latest` on tag pushes.

## Platform Configs

| Platform | Build runner | Artifact | Notes |
|----------|-------------|----------|-------|
| darwin-arm64 | macos-latest | Kubby-arm64.dmg | Apple Silicon |
| darwin-x64 | macos-latest | Kubby-x64.dmg | Intel Mac |
| win-x64 | windows-latest | KubbySetup.exe | NSIS installer, needs `choco install nsis` |

## Package Contents (~80-110 MB per platform)

```
kubby(.exe)          # Go launcher (~9MB)
node/                # Node.js 25 runtime
bin/
  ffprobe(.exe)      # Video probe
  ffmpeg(.exe)       # HLS transcoding
server/              # Next.js standalone
  server.js
  node_modules/      # Minimal deps (better-sqlite3, sharp)
  .next/
  public/
```

## Troubleshooting

- **npm ci fails with lockfile mismatch**: CI Node.js version must match local (currently Node 25). Update `node-version` in `release.yml`.
- **Windows: KubbySetup.exe not generated**: `makensis` not found. CI uses `choco install nsis`. Locally: `brew install nsis` (macOS) or `choco install nsis` (Windows).
- **Native module crash on target platform**: Both `server/node_modules/better-sqlite3/` AND `server/.next/node_modules/better-sqlite3-*/` must have the correct platform binary. The package script handles this via `swapNativeModules()`.
