# Setup Wizard UX Review

A product/UX review of the first-run setup wizard (`src/app/(setup)/setup/setup-wizard.tsx`) and its
backing endpoint (`src/app/api/setup/complete/route.ts`). This is a review only — no fixes have been
applied. Findings are numbered below, each with the issue, its location, why it matters, and a
recommended fix. A priority summary follows.

## Findings

### 1. Eye-toggle icon is inverted

**Where:** `setup-wizard.tsx` lines 331–335 (password field) and lines 358–362 (confirm-password field).

```tsx
{showPassword ? (
  <Eye className="h-[18px] w-[18px]" />
) : (
  <EyeOff className="h-[18px] w-[18px]" />
)}
```

**Why it's a problem:** The wizard renders `<Eye>` when the password is *already visible* and
`<EyeOff>` when it's hidden. The established convention (used everywhere else, including most
password managers and browsers) is the opposite: the open eye means "click to reveal," and the
slashed eye means "currently visible, click to hide." As written, the icon shown while typing
(`showPassword === false`) is the crossed-out eye, signaling "hidden" in a way that reads as
already-toggled-off rather than an affordance to reveal.

**Recommended fix:** Swap the branches so `<EyeOff>` renders when `showPassword` is `true` and
`<Eye>` renders when `showPassword` is `false`, for both the password and confirm-password toggles.

### 2. No password strength or minimum-length requirement

**Where:** `handleAdminNext`, `setup-wizard.tsx` lines 134–150 (specifically line 140: `if (password.length < 1)`).

**Why it's a problem:** This is the account that will hold admin/root privileges over the entire
media server. The only validation is "non-empty" — a one-character password like `"a"` passes.
There's no length floor, no strength hint, and no client-side signal to the user about what makes a
good admin password.

**Recommended fix:** Enforce a minimum length (e.g., 8 characters) before allowing `handleAdminNext`
to proceed, and consider a lightweight strength indicator (length + character-class mix) rendered
under the password field as a hint rather than a hard blocker.

### 3. Hardcoded English validation errors bypass i18n

**Where:** `setup-wizard.tsx` lines 137, 141, 145:

```tsx
setError("Username is required");
...
setError("Password is required");
...
setError("Passwords do not match");
```

**Why it's a problem:** The rest of the wizard is fully internationalized via `t(...)` /
`tc(...)` / `tAuth(...)` (see e.g. `t("libraryNameRequired")` and `t("tmdbApiKeyRequired")` at lines
167 and 172, which correctly use the translation hook). These three admin-step error strings are
plain English literals. A user who selected 中文 on step 1 will still see English error text on step
2 — a visible, jarring inconsistency right after choosing their language.

**Recommended fix:** Add i18n keys (e.g. `setup.usernameRequired`, `auth.passwordRequired`,
`auth.passwordsDoNotMatch` — reuse existing `auth`/`setup` namespaces already imported as `t`/`tAuth`)
and replace the three literals with translated lookups.

### 4. Inconsistent library-type options across three surfaces

**Where:**
- `setup-wizard.tsx` lines 421–425 — offers Movie, TV Shows, and Music, but Music is `disabled` and
  labeled "Music (coming soon)"; Photo is not offered at all.
- `src/components/library/add-library-card.tsx` lines 138–142 — offers Movie, TV Shows, and Music
  (enabled, no "coming soon" label); Photo is not offered.
- `src/app/(main)/dashboard/libraries/page.tsx` lines 378–383 — offers all four: Movie, TV Shows
  (`t("libraryTypeTv")`), Photo (`t("libraryTypePhoto")`), and Music (`t("libraryTypeMusic")`).

**Why it's a problem:** Music and Photo are both shipped, first-class domains in Kubby (the dashboard
dialog treats all four types as equally available). Yet the setup wizard tells first-run users Music
is "coming soon" (false — it already works) and hides Photo entirely, and the homepage
"Add Library" card independently omits Photo while enabling Music without the TMDB-scraper gating
context that the wizard applies. A new user who only goes through setup will believe Kubby only
supports two of its four domains, and even returning users who add libraries from the homepage card
won't see Photo as an option — they'd have to find the dashboard to discover it.

**Recommended fix:** Unify all three surfaces to present the same four options — Movie, TV Show,
Photo, Music — sourced from one shared list/constant so future domain additions only need a single
edit point.

### 5. Setup never triggers a library scan

**Where:** `src/app/api/setup/complete/route.ts` lines 54–65. The handler inserts a row into
`mediaLibraries` but never calls into the scan pipeline (no scan-queue enqueue, no call to a scanner
service).

**Why it's a problem:** After finishing setup with a library configured, the user is dropped onto what
looks like a fully set-up Kubby instance, but the library is empty until a scan runs — which never
happens automatically. The user has to know to trigger a manual scan from the dashboard. First
impressions matter, and a blank homepage right after "You're all set!" undercuts it.

**Recommended fix:** After creating the library row, enqueue/trigger a scan (matching whatever
mechanism `/api/libraries` POST uses when a library is created outside of setup, for consistency).
Note: the newly-added Demo Mode addresses this same blank-slate first-run problem directly by seeding
sample content, so this fix matters most for users who skip demo mode and configure a real library
during setup.

### 6. Step-3 primary button is mislabeled "Next" when it finishes setup

**Where:** `setup-wizard.tsx` line 594 (inside the step-3 submit button, `onClick={() =>
handleComplete(false)}`):

```tsx
{loading ? tc("loading") : tc("next")}
```

**Why it's a problem:** This button is the final action of the wizard — clicking it calls
`handleComplete`, which POSTs to `/api/setup/complete` and advances to the completion screen (step
4). Labeling it "Next" implies there's a step 4 form still to fill out, when in fact step 4 is just a
success screen with a "Go to Sign In" button. The mislabeling creates a moment of uncertainty right
before the user commits to finishing setup.

**Recommended fix:** Use a "Finish" / "Complete Setup" label (`tc("finish")` or a new
`t("completeSetup")` key) instead of `tc("next")` for this specific button.

### 7. Language selection as a full wizard step

**Where:** Step 1, `setup-wizard.tsx` lines 242–288; `handleLanguageSelect`, lines 62–66.

**Why it's a problem:** Language selection is dedicated a whole step (with its own slide-in
animation and a "Next" button) before the wizard's substantive steps (admin account, library) even
begin. A compact language switcher pinned to a top corner of the wizard shell would collapse this
into an ambient control, reducing the flow from 4 steps to 3 without losing the ability to switch
language. Separately, `handleLanguageSelect` calls `setLocale(locale)` followed immediately by
`router.refresh()`:

```tsx
async function handleLanguageSelect(locale: string) {
  setSelectedLocale(locale);
  await setLocale(locale);
  router.refresh();
}
```

`router.refresh()` re-fetches Server Component data and can, depending on how this client component
is mounted relative to the refreshed tree, reset local client state (including `step`, `screen`, and
any already-entered form values) if the component were to remount. This is currently only called
from step 1 before other state is populated, so it's low-risk today, but it's a latent trap if a
language switcher is later made available from later steps (as recommended above) — switching
language mid-wizard could silently drop entered admin/library data.

**Recommended fix:** Replace the dedicated step-1 screen with a persistent, compact language toggle
(e.g., top-right corner of the wizard card) visible across all steps. If `router.refresh()` is kept
for locale propagation, audit that it cannot fire after step 2+ state exists, or move locale
switching to a mechanism that doesn't require a router refresh (e.g., client-side `next-intl`
context) so it's safe to expose throughout the flow.

### 8. TMDB key validation failure is silent

**Where:** `src/app/api/setup/complete/route.ts` lines 41–52:

```ts
if (tmdbApiKey && typeof tmdbApiKey === "string") {
  const trimmedKey = tmdbApiKey.trim();
  const valid = await validateApiKey(trimmedKey);
  if (valid) {
    // ...save key...
  }
  // else: silently does nothing
}
```

**Why it's a problem:** If `validateApiKey` returns `false` (bad/expired key), the code simply skips
saving it and falls through to the rest of the handler, which still returns `Response.json({
success: true, libraryId })` at line 67. The client (`handleComplete` in `setup-wizard.tsx`, lines
192–197) only surfaces an error when `!res.ok`; since the response is always `200` regardless of key
validity, the user sees the normal "step 4 success" screen with no indication that their TMDB key
wasn't saved. They'll only discover it later when metadata scraping silently doesn't happen.

**Recommended fix:** When `tmdbApiKey` is provided but fails validation, either (a) return a non-200
response with a specific error the client can display (e.g., `tmdbKeyInvalid`), or (b) return `200`
but include a warning field (e.g., `{ success: true, libraryId, warnings: ["tmdb_key_invalid"] }`)
that the client renders as a non-blocking notice before advancing to step 4.

### 9. Accessibility gaps: unassociated labels and unlabeled icon buttons

**Where:**
- All `<label>` elements in `setup-wizard.tsx` (e.g. lines 301, 315, 342, 400, 414, 431, 496, 509,
  530) render plain text with no `htmlFor`, and the corresponding `<input>` / `<Select>` elements have
  no matching `id`.
- The password visibility toggle buttons (lines 326–336 and 353–363) have no `aria-label` (or
  `aria-pressed`) — they're icon-only buttons with no accessible name.

**Why it's a problem:** Screen reader users get no programmatic association between a label and its
field (clicking/focusing the label won't move focus to the input, and some screen readers won't
announce the label at all when reading the input). The eye-toggle buttons announce as an unlabeled
button with no indication of what they do or their current state.

**Recommended fix:** Add matching `id`/`htmlFor` pairs to every label+input/Select combination, and
add `aria-label` (e.g. "Show password" / "Hide password", updated dynamically with `showPassword`)
plus `aria-pressed={showPassword}` to the two eye-toggle buttons.

## Priority Summary

| # | Finding | Priority | Rationale |
|---|---------|----------|-----------|
| 1 | Eye-toggle icon inverted | High | Correctness bug — icon communicates the wrong affordance to every user, every time |
| 3 | Hardcoded English validation errors | High | i18n breakage — directly contradicts the language chosen one step earlier |
| 4 | Inconsistent library-type lists across 3 surfaces | High | Consistency/discoverability — hides shipped domains (Photo) and mislabels another (Music "coming soon") |
| 2 | No password strength/length requirement | Medium | Security hygiene for the admin account |
| 5 | Setup never triggers a scan | Medium | First-run experience — empty homepage after setup (partially mitigated by Demo Mode) |
| 6 | Step-3 CTA mislabeled "Next" | Medium | Minor clarity issue at the most consequential click of the flow |
| 9 | Accessibility gaps | Medium | Screen-reader usability on every field in the wizard |
| 7 | Language as a full dedicated step | Low | Flow-length/UX polish; includes a latent state-reset risk to flag, not an active bug |
| 8 | TMDB key fails silently | Low | Confusing but recoverable — user can re-enter the key later in Dashboard > Scraper |
