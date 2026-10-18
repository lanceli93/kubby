# Spatial navigation (drawer push-back + domain cards + domain transition)

Branch: `feat/spatial-nav`. Goal: make the four media domains feel like one space.

- [x] B1 — Drawer state lifted to layout; NavSidebar rendered OUTSIDE the page shell; opening the drawer pushes the whole page shell back in depth (scale + translate + slight rotateY + rounded + dim) instead of the full-page blur backdrop.
- [x] B2 — `GET /api/domains/preview` + `DomainCard` component + `useDomainItems()` hook.
- [x] A — Domain-switch View Transition (`startDomainTransition()`); drawer MEDIA group + header brand dropdown use `DomainCard`.
- [x] C — Home/TV row cards retarget the ambilight on hover; hero rotation (`setBase`) no longer overrides an active hover target.
