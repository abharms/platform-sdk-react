---
'@youversion/platform-core': major
'@youversion/platform-react-hooks': major
'@youversion/platform-react-ui': major
---

Every exported visual component in `@youversion/platform-react-ui` now renders inside a Shadow DOM root by default, isolating its internal styling from host-page selectors (Tailwind preflight, hand-written `button {}` rules, broad `!important` declarations, etc.) with no consumer wrapper required.

**BREAKING:** Isolation is on by default. Consumers who were relying on host CSS "leaking into" SDK components — through selectors or inherited CSS variables — will no longer see those overrides apply. Use documented component props and provider themes instead, or use `@youversion/platform-react-hooks` to build fully custom UI.

Consumer migration notes:

- DOM queries and test automation must be shadow-aware. Playwright locators pierce open shadow roots by default; DOM Testing Library queries should start from the host's `shadowRoot`.
- Overlay components remain style-isolated by portaling inside their shadow tree, so clipping or stacking constraints on host ancestors can affect popovers and dialogs.
- Shadow roots attach after client mount: SSR initially emits an empty host, and forwarded DOM refs become available on a subsequent commit.
- `@font-face` family names remain document-scoped. A host that registers another face as `Inter`, `Untitled Serif`, or `Source Serif 4` can still affect SDK typography.

What shipped:

- **Shared infra:** `withShadowIsolation` HOC and `createShadowAwareFocusTrap` (extracted from the popover); the shared `Popover` and `YouVersionAuthButton` refactored onto them.
- **Portal parity:** `dialog.tsx` and `verse-action-popover.tsx` redirect their Radix portals into the shadow root and use the shared focus trap (no-op outside a shadow root).
- **Test escape hatch:** an `@internal`, unexported setter in `.storybook/preview.tsx` lets the behavior suite run un-isolated while production always isolates.
- **Components wrapped:** every independently mountable public visual export, with compound components sharing one root and context-only child components reusing their parent's root.

Isolation is proven in a real browser with a hostile-CSS harness covering every independently mountable visual export, plus dedicated interaction tests for portaled components. See `docs/adr/0005-shadow-dom-style-isolation.md` for the architecture, threat model, and deferred follow-ups.
