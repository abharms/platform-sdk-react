---
'@youversion/platform-core': major
'@youversion/platform-react-hooks': major
'@youversion/platform-react-ui': major
---

Every exported component in `@youversion/platform-react-ui` now renders inside its own Shadow DOM root by default, isolating its styling from the host page. Drop any component into any host page and its appearance is immune to the consumer's global CSS (Tailwind preflight, hand-written `button {}` rules, etc.) — no consumer wrapper required.

**BREAKING:** Isolation is on by default. Consumers who were (knowingly or accidentally) relying on host page CSS "leaking into" SDK components — restyling them via global selectors — will no longer see those overrides apply, because the components now live in a shadow tree. To customize appearance, use the components' documented props / theming rather than global CSS. An escape hatch (`withShadowIsolation` HOC) exists for advanced control.

What shipped:

- **Shared infra:** `withShadowIsolation` HOC and `createShadowAwareFocusTrap` (extracted from the popover); the shared `Popover` and `YouVersionAuthButton` refactored onto them.
- **Portal parity:** `dialog.tsx` and `verse-action-popover.tsx` redirect their Radix portals into the shadow root and use the shared focus trap (no-op outside a shadow root).
- **Test escape hatch:** an `@internal`, unexported setter in `.storybook/preview.tsx` lets the behavior suite run un-isolated while production always isolates.
- **Components wrapped:** `ProfileAvatar` (+ token/theme fix), `BibleTextView`, `VerseOfTheDay`, `BibleCard`, `VerseActionPopover`, `BibleThemeSettingsContent`, plus the compound roots `BibleChapterPicker` and `BibleVersionPicker` (one shared shadow root each).

Isolation is proven in a real browser for `YouVersionAuthButton`, `BibleVersionPicker` (13 interaction tests), `ProfileAvatar`, and `BibleReader`. See `docs/adr/0005-shadow-dom-style-isolation.md` for the completed rollout and deferred follow-ups (remaining re-proof stories, SSR/first-paint flash via the verified react-shadow DSD path, portal-clipping architecture).
