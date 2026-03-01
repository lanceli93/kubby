# Kubby UI Design Review — Utility Pages

> Date: 2026-03-01
> Scope: Setup, Dashboard, User Settings, Auth pages
> Status: Analysis complete, pending implementation

## Overview

The **main content pages** (Home, Movie Detail, Browse) are well-designed — cinematic hero sections, layered gradients, hover interactions on cards, scroll carousels. They feel alive and immersive.

The **utility pages** (Setup, Dashboard, Settings) feel rigid and lack the same polish. This document identifies the key issues and provides actionable suggestions.

---

## Problem 1: Visual Monotony — "Same Card, Different Data"

Every section across Dashboard, Settings, Setup uses the identical glass card:

```
rounded-xl border border-white/[0.06] bg-black/40 backdrop-blur-xl p-6
```

There's no variation in elevation, background treatment, or visual weight. Everything sits at the same depth, making pages feel flat despite the blur effect.

**Suggestion:** Introduce 2-3 card tiers:

- **Elevated cards** (primary sections): Slightly brighter bg (`bg-white/[0.06]`), stronger blur, subtle `shadow-[0_4px_24px_rgba(0,0,0,0.3)]`
- **Recessed cards** (secondary/nested info): `bg-black/60` with no blur — feels "behind" other content
- **Accent cards** (stats, highlights): Add a subtle gradient border or a top-edge glow (`border-t border-primary/20`)

---

## Problem 2: Static Inputs & Forms — No Feedback, No Life

Every form input is styled identically with just a `focus:border-primary` transition. The Setup wizard, Login, Register, Dashboard settings forms all feel like generic data entry.

**Suggestion:**

- Add `transition-all duration-200` to inputs
- On focus: slight background lighten (`bg-white/[0.04]`), a subtle glow (`ring-1 ring-primary/30`), and label float or color shift
- Group related inputs with subtle section dividers or indent them under category labels
- Add inline validation with animated check/error icons

---

## Problem 3: Setup Wizard Feels Like a Form, Not an Experience

The 4-step wizard is just a centered card with fields swapping. The progress dots at the bottom are minimal. There's no sense of progression or accomplishment.

**Suggestion:**

- Add a **step transition animation** — content slides left/right between steps (or fades with a slight Y-translate)
- Replace dots with a **progress bar** or **numbered steps** with connecting lines, where completed steps get a check icon + primary color fill
- Add a subtle **background shift** per step (e.g., the radial gradient center shifts or changes hue slightly)
- The language selection cards could use **flag icons** or a more visual treatment
- Consider a **welcome animation** on the first step — the Kubby logo could scale in or have a subtle glow pulse

---

## Problem 4: Dashboard Has No Visual Hierarchy

The Dashboard overview is a grid of identical stat cards followed by identical section cards. There's no focal point, no visual rhythm.

**Suggestion:**

- **Hero stat row**: Make the top stats bigger, use large numbers with a trend indicator or sparkline
- **Stat card differentiation**: Each stat could have a subtle left-border accent color (blue for movies, green for storage, amber for users)
- **Section headers**: Add a small icon + decorative line (`border-b with gradient from-primary/40 to-transparent`)
- **Quick actions**: Style as icon-forward buttons with a hover lift effect, not plain bordered rectangles
- **Activity/recent section**: Add timestamps with relative formatting and subtle row hover highlights

---

## Problem 5: Admin Sidebar Is Bare

The sidebar (`w-60, bg-black/30`) has plain text links with only a left-border indicator for active state. It feels utilitarian.

**Suggestion:**

- Active item: Add a subtle background gradient (`bg-gradient-to-r from-primary/10 to-transparent`) instead of just border + flat bg
- Icons: Ensure consistent icon + label alignment with `gap-3`
- Section dividers: Use a thin gradient line instead of just spacing
- Bottom area: Add a collapsible server status indicator (uptime, version, storage usage mini-bar)
- Consider a subtle hover animation — bg slides in from left

---

## Problem 6: User Settings Page Lacks Personality

It's a stack of glass cards with basic form elements. The large avatar circle is just a `bg-primary` div.

**Suggestion:**

- **Avatar area**: Add an upload overlay on hover (camera icon + "Change" text), a subtle ring/glow around the avatar
- **Section organization**: Use tabs or an anchor-nav sidebar instead of a long vertical scroll
- **External player selector**: The current toggle buttons are functional but could use icons for each player type (VLC icon, IINA icon, etc.) and a more visual card-style selector
- **Preference toggles**: Use animated toggle switches instead of bordered buttons
- **Danger zone** (delete account, etc.): Visually separate with a `border-destructive/20` section with a warning icon

---

## Problem 7: Missing Motion & Micro-Interactions

The content pages have hover effects on movie cards, but the utility pages are completely static. No entrance animations, no hover states beyond color changes.

**Suggestion:**

- **Page enter**: Stagger-fade children with `animation-delay` (e.g., each card fades in 50ms after the previous)
- **Card hover**: Subtle `translate-y-[-2px]` lift + border brighten
- **Button interactions**: Scale down slightly on click (`active:scale-[0.98]`), loading states with spinner
- **Toast notifications**: Slide in from bottom with spring animation instead of just appearing
- **Sidebar navigation**: Active indicator slides smoothly between items (use a pseudo-element with `transition-all`)

---

## Problem 8: Typography Is Flat

Inter is used everywhere at very similar sizes. Headings are just bolder versions of body text. Nothing draws the eye.

**Suggestion:**

- **Page titles**: Bump to `text-3xl font-bold` with slight letter-spacing (`tracking-tight`)
- **Stat numbers**: Use `tabular-nums` and a heavier weight, possibly a different font for numeric displays
- **Helper text**: Use `text-[11px]` with `uppercase tracking-wider` for category labels (the sidebar already does this — extend it)
- **Consider a display font** for the "Kubby" brand text in setup/login — even just using `font-bold tracking-tighter text-5xl` with a subtle gradient text effect would elevate it

---

## Implementation Priority

| Priority | Change | Impact | Effort |
|----------|--------|--------|--------|
| 1 | Page entrance animations (stagger fade) | High | Low |
| 2 | Card tier system (elevated/recessed/accent) | High | Medium |
| 3 | Setup wizard step transitions | High | Medium |
| 4 | Input focus improvements (glow + bg shift) | Medium | Low |
| 5 | Dashboard stat card differentiation | Medium | Low |
| 6 | Sidebar active state animation | Medium | Low |
| 7 | Settings page section reorganization | Medium | Medium |
| 8 | Typography hierarchy refinement | Medium | Low |

---

## Files Affected

| Area | Key Files |
|------|-----------|
| Setup Wizard | `src/app/(setup)/setup/setup-wizard.tsx` |
| Auth Pages | `src/app/(auth)/login/login-form.tsx`, `src/app/(auth)/register/page.tsx` |
| Dashboard Overview | `src/app/(main)/dashboard/page.tsx` |
| Dashboard Libraries | `src/app/(main)/dashboard/libraries/page.tsx` |
| Dashboard Users | `src/app/(main)/dashboard/users/page.tsx` |
| Dashboard Scraper | `src/app/(main)/dashboard/scraper/page.tsx` |
| Dashboard Networking | `src/app/(main)/dashboard/networking/page.tsx` |
| User Settings | `src/app/(main)/settings/page.tsx` |
| Admin Sidebar | `src/components/layout/admin-sidebar.tsx` |
| Global Styles | `src/app/globals.css` |
