---
'@youversion/platform-core': minor
'@youversion/platform-react-hooks': minor
'@youversion/platform-react-ui': minor
---

Add an experimental `ShadowRootHost` / `useShadowRoot` export to `@youversion/platform-react-ui`, spiking a fix for host global CSS overriding SDK component styles.

- `ShadowRootHost` attaches a real `ShadowRoot` around its children and injects the SDK's compiled styles directly into it, so components rendered inside are immune to a consumer's unlayered global CSS (Tailwind v3 preflight, hand-written `button {}` rules, etc.).
- `YouVersionAuthButton` needed no changes to work inside it: `<ShadowRootHost><YouVersionAuthButton /></ShadowRootHost>`.
- `useShadowRoot()` is exported so consumers can redirect Radix `Portal` containers into the same shadow tree.
- The shared `Popover` (`packages/ui/src/components/ui/popover.tsx`, used by `BibleChapterPicker`, `BibleVersionPicker`, `verse-action-popover`, and `BibleReader`) now does this automatically: its Radix `Portal` redirects into `useShadowRoot()` when rendered inside a `ShadowRootHost`, and falls back to `document.body` otherwise — a no-op for every existing usage. Verified against a real, unmodified `BibleVersionPicker`: dismiss behavior (inside-click, outside-click, Escape) and actual version-selection logic both work correctly inside a shadow root.

Both exports are tagged `@internal` — this is a validated spike on two components, not a stable, documented API yet. See `docs/adr/0005-shadow-dom-style-isolation-spike.md` for findings and what's still deferred (Radix Dialog, focus-scope/focus-trap behavior, SSR flash, an `!important`-reset comparison).
