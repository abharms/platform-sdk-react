# 5. Shadow DOM style-isolation spike

Date: 2026-08-04

## Status

Accepted as the style-isolation strategy for `@youversion/platform-react-ui`.
This is a strategy decision, not a completion notice: the spike validated
viability on one component (`YouVersionAuthButton`) and one shared primitive
(`ui/popover.tsx`). Full rollout and the open risks below are tracked in Next
Steps.

## Context

Consumers embedding the SDK into pages that ship their own global/unlayered
CSS (Tailwind v3, or a hand-written stylesheet with plain `button {}`/`a {}`
rules) see those host rules override SDK component styles. Reproduced with a
local harness (not shipped in this repo); the hostile `button {}` rule is kept
as a test fixture in `packages/ui/src/test/hostile-host-styles.ts`.

The SDK already wraps its CSS in `@layer yv-sdk-*` so it ranks below a
consumer's layers. **That cannot fix this bug:** per the cascade, any unlayered
author-origin declaration beats any layered one, regardless of specificity or
order. Host apps routinely ship unlayered CSS (Tailwind v3 emits unlayered
preflight/utilities; a hand-rolled stylesheet is unlayered by default), so no
selector-writing inside our layers can win.

### Product requirement, not just a preference

Per explicit instruction from YouVersion: the SDK's components must maintain
their intended look regardless of host CSS. A consumer's ability to override
SDK styling via arbitrary CSS today is an **accidental bug, not a supported
feature.** This is what decides the strategy — the bar is "no matter what the
host does," not "usually."

### Alternatives rejected

- **`@scope`** — irrelevant. It only constrains which elements a stylesheet's
  *own* rules match; it cannot lower the priority of an unrelated host
  stylesheet.
- **`!important` cascade-layer reset** ("unsetting prior styles") — exploits a
  real quirk (an early-declared layer's `!important` beats later layers and
  unlayered author styles), and was seriously evaluated. Rejected as the
  general strategy: it's an allowlist of protected properties that must be
  maintained forever (any unprotected property silently reintroduces the bug),
  and it still loses to a host that declares its own named layer earlier than
  ours. A structurally best-effort mechanism cannot satisfy a "no matter what"
  bar.

**Real Shadow DOM** (`attachShadow({mode:'open'})`) is the only mechanism that
can: it is browser-enforced and immune to the origin/layer/specificity rules
causing the bug — outside stylesheets categorically cannot cross a shadow
boundary.

> **Known limitation to close before claiming completeness:** *inherited*
> properties (`color`, `letter-spacing`, `text-transform`, etc.) and inherited
> custom properties *do* cross the boundary by spec. The reproduction fixture
> uses a type selector (`button {}`), which Shadow DOM blocks perfectly, but a
> host `body { letter-spacing: 4px }` would still bleed in. A one-time reset of
> the (finite) inherited-property set at the shadow root is required — bounded,
> unlike the rejected `!important` allowlist. Tracked in Next Steps.

## Decision

Promote `ShadowRootHost` (`packages/ui/src/lib/shadow-root-host.tsx`) from
throwaway spike to a real `@internal` primitive:

```tsx
<ShadowRootHost>
  <YouVersionAuthButton background="light" />
</ShadowRootHost>
```

It attaches a real `ShadowRoot`, portals `children` into it, and injects the
SDK's compiled CSS (`__YV_STYLES__`) **directly into the shadow root** (via
`adoptedStyleSheets`, with a `<style>`-tag fallback for jsdom/older browsers).
This is not optional: `<YvStyles />` hoists into `document.head`, and a
`ShadowRoot` is a separate style-scoping boundary — head styles do not cross
in, so without injection a shadow-wrapped component renders unstyled.

`YouVersionAuthButton` was the first component because it has no Radix
Portal/Dialog, so isolation could be proven without tangling in the separate
question of whether Radix's internals survive a shadow boundary.

That harder question was addressed next: `ui/popover.tsx` now redirects its
`PopoverPrimitive.Portal` `container` to `useShadowRoot()` when inside a
`ShadowRootHost` (falling back to `document.body`, Radix's default, otherwise —
a no-op for every existing non-shadow usage). Every Popover-based component
benefits automatically once wrapped, no per-component change.

### Customization model, once locked down

Full CSS/`className` override goes away — that's the point. Customization is
**via component props only** (`radius`, `size`, `variant`, `background`,
`theme`, …). Props are the controlled surface: the component decides what each
prop is allowed to change (rounded vs. squared, light vs. dark), and a prop
maps to an internal token under the hood — the host never touches the token
directly.

`--yv-*` tokens stay **internal implementation detail**, declared flat
(`--yv-primary: <default>`) so a host setting `--yv-primary` on an ancestor
cannot override them. This matters under Shadow DOM specifically: inherited
custom properties *do* cross the boundary, so the flat declaration — not the
boundary — is what closes that channel (`all: initial` at the shadow root does
not reset custom properties). We therefore **do not** rewrite tokens with the
`var(--x, <default>)` fallback pattern; that would deliberately *open* the
override channel. Promoting a single token to a public, host-overridable
variable is a rare, explicit, case-by-case decision — not a channel we build by
default.

For anything props don't cover, the answer is the **headless layer**
(`@youversion/platform-core` + `-react-hooks`): build a custom UI without the
SDK's styling opinions rather than reopening the CSS surface.

Consumers relying on the accidental override will see it stop working on their
next version bump — accepted as a normal breaking change (see Consequences).

## Findings

- **Style isolation works and is provable.** `YouVersionAuthButton`'s
  `StyleIsolation` story injects the hostile `button {}` fixture into
  `document.head`, asserts a light-DOM control button *does* change (proving
  the fixture reproduces the bug), and asserts the shadow-wrapped button is
  untouched. Also confirmed visually against the local harness: broken plain
  button vs. correct shadow-wrapped one side by side; pixel-identical with the
  hostile CSS off (no visual regression from the wrapper itself).
- **`data-yv-sdk`/`data-yv-theme` stay required.** `theme.css` defines tokens
  under `[data-yv-sdk]`, and dark mode depends on `[data-yv-sdk][data-yv-theme]`
  on an ancestor. Shadow DOM scopes which rules apply; it doesn't make bare
  tokens resolve.
- **`ref` forwarding survives the boundary** — `forwardRef` follows the React
  tree, not DOM location. Confirmed `ref.current` resolves to the real
  `<button>` inside the shadow tree and a click through it still fires `signIn`.
- **Inter renders correctly** inside the shadow root (duplicated into the
  injected `__YV_STYLES__`). *Not validated:* whether a `@font-face` declared
  only in `document.head` (Untitled Serif via `<YvFonts />`) is usable inside a
  shadow tree — `YouVersionAuthButton` renders no serif text.
- **Radix Popover behaves correctly inside a shadow root** — verified on real
  production code (`bible-version-picker.shadow-isolation.stories.tsx`):
  inside-click doesn't falsely close, outside-click and Escape do close, and
  selecting a version still closes the picker and updates the trigger. All 11
  original non-shadow picker tests remain green.
- **Confirmed Radix bug: focus-trap wraparound breaks in a shadow root.**
  `@radix-ui/react-focus-scope` compares against `document.activeElement`,
  which inside a shadow tree resolves to the host, so its wraparound never
  fires and Tab leaks focus out of the dialog. Fixed in `ui/popover.tsx` with
  an `onKeyDown` (active only inside a shadow root) that redoes edge-detection
  using `shadowRoot.activeElement`.
- **ARIA `aria-controls` resolves correctly** — the trigger and portaled dialog
  end up in the *same* shadow root, so the id-reference is same-tree, not
  cross-root. Structural relationship confirmed; real screen-reader behavior
  not yet tested (see Next Steps).
- **Keyboard behavior can only be tested with trusted input.** The integration
  tests run in Vitest browser mode (Playwright). `storybook/test`'s `userEvent`
  (testing-library) simulates Tab in JS and *cannot see into a shadow root*, so
  it silently defocuses everything regardless of what's tested; a dispatched
  `KeyboardEvent` is untrusted and moves no focus at all. Only Playwright's
  CDP-backed input (`import { userEvent } from 'vitest/browser'`) exercises the
  browser's real tab-order. **Every keyboard finding below required it, and any
  prior keyboard claim verified without it should be treated as unverified.**
- **Three real tab-order bugs found with trusted input, all now fixed + tested:**
  - Positive `tabIndex={1}` on the search inputs put them at the front of the
    tab scope, so Shift+Tab was a backwards exit off the front edge (a silent
    focus-loss in light DOM; a visible dismiss in shadow DOM — Shadow DOM
    converted a silent bug into a visible one, it didn't cause it). Removed all
    three; a test asserts `tabIndex === 0`.
  - `opacity:0`/`pointer-events:none` do **not** remove the inactive crossfade
    panel from the tab order, so Tab walked ~10 invisible focusables. Fixed with
    `inert` (removes it from tab order + a11y tree without touching layout).
  - The custom handler's tabbable query matched roving-`tabindex="-1"` and
    hidden/inert elements. Now filtered through an `isTabbable` predicate
    mirroring Radix's own semantics.
- **Decided: keep Radix's focus loop.** Radix hardcodes `loop: true`, so Tab
  past the last element cycles to the first even for non-modal popovers. This
  diverges from the WAI-ARIA APG but is not a WCAG keyboard trap (Escape closes
  and restores focus). Kept for consistency with every other Radix popover.

## Consequences

- **Flash of empty on first paint.** `attachShadow` runs only in `useEffect`,
  so there's no SSR content. Not solved here.
- `ShadowRootHost`/`useShadowRoot` are exported `@internal`/unstable — a real
  publishable surface change (changeset included), not yet a supported public
  pattern.
- **Accepted breaking change:** consumers relying on the accidental CSS-override
  bug will see styling silently stop applying on their next version bump, with
  no runtime error. The lockdown release must call this out by name in its
  changeset and name the replacement (props, or the headless layer).

## Next Steps

In priority order:

1. **Close the inherited-property gap** (see Context note) — a bounded one-time
   reset of inherited properties at the shadow root, plus a hostile fixture that
   exercises `letter-spacing`/`text-transform`/`color`, not just `button {}`.
   Without this the "no matter what" guarantee is not actually met.
2. **Finish Popover verification** — real assistive-tech behavior
   (VoiceOver/NVDA) is still untested; only the structural ARIA relationship is
   confirmed. Also audit other components for `opacity`/`visibility`-hidden
   content left in the tab order.
3. **Bring Radix Dialog to parity with Popover** — same `container`-redirect,
   tested against `sign-in-dialog.tsx`/`highlight-permission-dialog.tsx`. A
   different primitive; Popover's result doesn't extend automatically.
4. **Resolve portal-clipping vs. body-escape.** Radix portals to `document.body`
   to escape ancestor `overflow`/clipping; redirecting into a locally-nested
   shadow root reintroduces that risk. An architectural decision (where shadow
   roots attach), not just code.
5. **Keep tokens flat; expand props as gaps surface.** Customization is
   props-only (see Decision), so there is no CSS-vars layer to build — tokens
   stay flat/internal. Adding a prop for a real gap is ordinary product work;
   promoting a token to a public, host-overridable variable is a deliberate
   exception, not the default path.
6. **Roll out to the rest of the component surface** — shadow rendering baked
   into each component internally (no consumer-facing wrapper), with one
   shared-shadow-root decision per compound component (`BibleReader`,
   `BibleChapterPicker`, `BibleVersionPicker`).
7. **Longer-horizon:** external code review; cross-browser verification
   (Chromium-only so far); SSR-flash mitigation (declarative Shadow DOM);
   Untitled Serif `@font-face`-crossing verification; productionize
   `ShadowRootHost`/`useShadowRoot` from `@internal` to stable.
