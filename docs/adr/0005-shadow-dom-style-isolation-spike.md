# 5. Shadow DOM style-isolation spike

Date: 2026-08-04

## Status

Accepted; amended 2026-08-04 with keyboard/tab-order findings that postdate
the original spike (see Findings, and Next Steps #1 — which this amendment
reopens).

Accepted as the chosen style-isolation strategy for
`@youversion/platform-react-ui`, following team discussion after this spike.
Shadow DOM is confirmed over the `!important` cascade-layer-reset
alternative (see Context/Decision). This is a strategy decision, not a
completion notice — the spike validated viability on one component
(`YouVersionAuthButton`) and one shared primitive (`ui/popover.tsx`); the
full rollout across the rest of the component surface, and the remaining
open risks below, are tracked as Next Steps, not resolved by this ADR.

## Context

Consumers embedding `@youversion/platform-react-ui` into pages that ship
their own global/unlayered CSS (a Tailwind v3 host app, or a hand-written
global stylesheet with plain `button {}`/`a {}` rules) see those host rules
override SDK component styles. This was demonstrated with a local
reproduction harness (a small Vite app with a real Tailwind v3 build and a
hand-written global stylesheet, both loaded alongside the SDK — not shipped
in this repo): toggling either one on visibly clobbers `YouVersionAuthButton`
and friends (Comic-Sans, full-width, black-bordered buttons instead of the
SDK's own styling). The hostile `button {}` rule used to reproduce this is
preserved as a fixture in the shipped automated test — see
`packages/ui/src/test/hostile-host-styles.ts`.

The SDK already wraps all its CSS in `@layer yv-sdk-*`
(`packages/ui/src/styles/global.css`), specifically so it ranks below a
consumer's own layers. That strategy cannot fix this bug: per the CSS
cascade, **any unlayered author-origin declaration beats any layered
author-origin declaration, regardless of selector specificity or
declaration order.** Host apps routinely ship at least some unlayered CSS —
Tailwind v3 emits fully unlayered preflight and utilities at build time; a
hand-rolled stylesheet is unlayered by default — so no amount of clever
selector-writing inside the SDK's own layers can win against it.

### Product requirement, not just an engineering preference

Per explicit instruction from YouVersion: the SDK's components are designed
to look a very specific way and must maintain that quality of detail — this
holds regardless of what a host page's CSS does. The ability for a consumer
to override SDK styling via arbitrary CSS today (outside of a deliberately
specified set of CSS variables — see Decision) is characterized as an
**accidental bug**, not a supported feature. This is the requirement that
actually decides the strategy question below: it's not "which approach is
cheaper," it's "which approach can guarantee this holds no matter what the
host does."

Two other directions were considered against that bar:

- **`@scope`** does not help, full stop. It only constrains which elements a
  stylesheet's *own* rules apply to; it cannot lower the priority of an
  unrelated host stylesheet. It is irrelevant to the bug demonstrated above.
- **A `!important` cascade-layer reset** (the "unsetting prior styles" idea)
  exploits a real, opposite-direction quirk of cascade layers — `!important`
  declarations in an early-declared layer beat later layers *and* unlayered
  author styles. This was seriously evaluated, not dismissed out of hand —
  but it's **rejected as the general-purpose strategy**: it's an allowlist
  of protected properties that has to be actively, reactively maintained
  forever (a host clobbering a property nobody thought to protect quietly
  reintroduces the original bug for exactly that property), and it still
  loses outright to a host that declares its own named CSS layer earlier in
  the document than ours. Given the requirement above is "no matter what,"
  not "usually," a mechanism that is structurally best-effort by
  construction cannot satisfy it, no matter how carefully tuned.

Real Shadow DOM (`element.attachShadow({mode:'open'})`) is the mechanism
this spike prototypes and the one that can actually satisfy the
requirement, because it is browser-enforced and immune to the
origin/layer/specificity rules causing the bug: outside stylesheets simply
cannot cross a shadow boundary — not "usually can't," categorically can't.

Two uncommitted, throwaway files (`packages/ui/src/lib/shadow-root-host.tsx`,
and now-deleted `shadow-dom-spike.tsx`/`.stories.tsx`) explored this earlier,
but only proved that Radix's Popover survives being portaled into a shadow
root — they never tested the actual bug (style bleed). This spike's job was
to convert one real, already-exported component and prove, with a
self-validating test, that host CSS can no longer touch it.

## Decision

Promote `ShadowRootHost` (`packages/ui/src/lib/shadow-root-host.tsx`) from
throwaway spike to a real, `@internal`-exported primitive:

```tsx
<ShadowRootHost>
  <YouVersionAuthButton background="light" />
</ShadowRootHost>
```

It attaches a real `ShadowRoot` and portals `children` into it. Critically,
it also injects the SDK's compiled CSS (`__YV_STYLES__`, the same constant
`<YvStyles />` renders into `document.head`) **directly into the shadow
root** via `shadowRoot.adoptedStyleSheets`, with a plain `<style>` tag
fallback for environments without constructable stylesheets (older browsers,
and jsdom in unit tests). This is not optional: `<YvStyles />` hoists into
`document.head` via React 19's `<style precedence>`, and a `ShadowRoot` is a
separate style-scoping boundary — head styles do not cross into it. Without
this, a shadow-wrapped component renders unstyled.

`YouVersionAuthButton` (`packages/ui/src/components/YouVersionAuthButton.tsx`)
was chosen as the first component **because it has no Radix Portal/Dialog**
— composing it inside `ShadowRootHost` required zero changes to the
component itself, so a style-isolation result is unambiguous and not
tangled with the separate, harder question of whether Radix's
dismissable-layer/focus-scope internals survive a shadow boundary.

The Radix question was addressed as a second step: `useShadowRoot()` is now
also wired into `packages/ui/src/components/ui/popover.tsx`, redirecting its
`PopoverPrimitive.Portal` `container` when rendered inside a
`ShadowRootHost` (see Findings). This is a real, permanent, non-throwaway
change to shared component internals — every consumer of Popover-based
components benefits automatically once wrapped, no per-component changes
needed — unlike `YouVersionAuthButton`, which required no shared-code change
because it has no Portal to redirect in the first place.

### Customization model, once locked down

Full CSS/`className`-based override goes away — that's the point. In its
place, the sanctioned customization surface is:

1. **Component props** (`radius`, `size`, `variant`, `background`, `theme`,
   etc.) — the primary surface, expanded as real needs are identified.
2. **A deliberately curated, documented subset of `--yv-*` CSS custom
   properties.** Unlike selectors, inherited properties — including custom
   properties — do cross a shadow boundary by spec, so a host can still set
   `--yv-primary` on an ancestor and have it reach a shadow-wrapped
   component's internals. This only works, though, if the token's own
   declaration is written to defer to an inherited value:
   `--yv-primary: var(--yv-primary, <default>);` rather than the current
   flat, unconditional `--yv-primary: <default>;` — today's tokens
   (`packages/core/src/styles/theme.css`) are declared the latter way, so
   this channel does not actually work yet even though the mechanism exists.
   **Not yet done:** deciding which tokens are the specified public surface
   (versus internal-only detail) and rewriting that subset with the
   fallback pattern — tracked in Next Steps.
3. **The headless layer, for anything props and specified variables don't
   cover.** `@youversion/platform-core` + `@youversion/platform-react-hooks`
   give a consumer the data/auth/state layer without any of `-react-ui`'s
   styling opinions, so "I need this to look different than the SDK allows"
   has an answer that doesn't require reopening the CSS surface: build your
   own UI on the headless layer instead of fighting the styled one.

Consumers currently relying on the accidental override (className/CSS
targeting internals outside the specified variables) will see that stop
working on their next version bump — accepted as a normal breaking change,
not a regression to design around; see Consequences for how it's
communicated.

## Findings

- **Style isolation works and is provable, not just plausible.**
  `YouVersionAuthButton.shadow-isolation.stories.tsx`'s `StyleIsolation`
  story is self-validating: it injects the same hostile `button {}` rule
  used to originally reproduce the bug
  (`packages/ui/src/test/hostile-host-styles.ts`) into `document.head` at
  runtime, asserts the light-DOM control button's computed style *does*
  change to match it (proving the fixture reproduces the bug — the test
  can't pass for the wrong reason), and asserts the shadow-wrapped button's
  computed style is untouched. This is materially stronger than the deleted
  spike's structural-presence checks, which never touched CSS at all.
- **Live proof, captured against the local reproduction harness (see
  Context — not shipped in this repo).** With both host stylesheets toggled
  on, a plain `YouVersionAuthButton` rendered visibly broken (Comic Sans,
  red/black, stretched full-width) while an identical component wrapped in
  `<ShadowRootHost>` right next to it rendered correctly, completely
  unaffected. With both stylesheets off, the two rendered pixel-identical —
  the shadow wrapper introduces no visual regression on its own.
- **`data-yv-sdk`/`data-yv-theme` remain required, not redundant, under
  Shadow DOM.** `packages/core/src/styles/theme.css` defines every `--yv-*`
  design token inside a `[data-yv-sdk] { ... }` selector, and
  `global.css`'s dark-mode `@custom-variant` depends on
  `[data-yv-sdk][data-yv-theme]` existing on an ancestor. Shadow DOM isolates
  which rules apply to a subtree; it does nothing to make bare tokens
  resolve. Both attributes stay on components exactly as before.
- **`ref` forwarding survives the shadow boundary.** `React.forwardRef`
  resolution follows the React element tree, not the DOM location a portal
  renders into. `RefAndEventsAcrossShadowBoundary` proves `ref.current`
  resolves to the real `<button>` inside the shadow tree
  (`ref.current.getRootNode() === shadowRoot`) and that a click through that
  ref still fires `useYVAuth`'s `signIn`.
- **Inter renders correctly inside the shadow root**, because it's
  duplicated into the shadow-injected copy of `__YV_STYLES__` (the Google
  Fonts `@import` in the `yv-sdk-fonts` layer ships with every copy). This
  does **not** validate whether a `@font-face` declared only in
  `document.head` — Untitled Serif, loaded via a `<link>` from `<YvFonts />`,
  never part of `__YV_STYLES__` (see
  [ADR-0004](0004-adopt-untitled-serif-via-fonts-api.md)) — is usable by
  text rendered inside a shadow tree. `YouVersionAuthButton` renders no
  serif text, so this spike could not exercise that case.
- **Radix's Popover behaves correctly inside a real shadow root — verified
  twice, the second time on real production code.** A first throwaway spike
  (`radix-popover-shadow-dom-spike.tsx`/`.stories.tsx` — deleted once
  superseded, per spike convention) wired a bespoke `PopoverPrimitive`
  usage directly to `useShadowRoot()` and confirmed three behaviors: a click
  *inside* the popover content does not falsely close it (the risk being
  that dismissable-layer's outside-click check could misclassify an inside
  click as outside once shadow-DOM event retargeting changes what
  `event.target` reports to an outer listener); a genuine outside click does
  close it; Escape closes it.

  `packages/ui/src/components/ui/popover.tsx` — the real, shared Popover
  every consumer of `BibleChapterPicker`, `BibleVersionPicker`,
  `verse-action-popover`, and `BibleReader` renders through — was then
  changed to redirect its own `PopoverPrimitive.Portal`'s `container` to
  `useShadowRoot()` (falls back to `document.body`, Radix's own default,
  when not inside a `ShadowRootHost` — a no-op for every existing,
  non-shadow usage; all 11 of `bible-version-picker.stories.tsx`'s existing
  integration tests still pass unchanged). `BibleVersionPicker` — real
  component, real network-backed data, unmodified itself — was then wrapped
  in `ShadowRootHost` and re-tested for real
  (`bible-version-picker.shadow-isolation.stories.tsx`): the same
  inside-click/outside-click behaviors hold, **and** actually selecting a
  version (a real click on a real list item, populated from mocked API
  data) still closes the picker and updates the trigger — proving the
  component's own business logic, not just Radix's dismiss mechanics,
  survives the shadow boundary.
- **A real, confirmed Radix bug: focus-trap wraparound breaks inside a
  shadow root — found, fixed, and verified.**
  `@radix-ui/react-focus-scope`'s Tab-key handler decides whether to wrap
  focus at the first/last tabbable element by comparing
  `document.activeElement` against the candidates it found inside the
  dialog. Inside a shadow tree, `document.activeElement` resolves to the
  *shadow host*, not the real focused descendant, so that comparison can
  never match — the wraparound `preventDefault()` never fires, and Tab past
  the last focusable element leaks focus out of the dialog entirely instead
  of looping back to the first item. This is upstream Radix behavior that
  predates broad shadow DOM usage, not anything specific to our wiring.

  Fixed in `packages/ui/src/components/ui/popover.tsx`: `PopoverContent`
  now carries its own `onKeyDown`, active only inside a shadow root (a
  no-op otherwise), that redoes the same edge-detection correctly using
  `shadowRoot.activeElement` and moves focus itself. It runs before Radix's
  own (still-present, still-broken, now-harmless) handler — Radix's
  `asChild`/`Slot` composition calls the innermost prop first — and
  composes correctly with any `onKeyDown` a caller already passes.

  **Getting a trustworthy test for this took a second, independent
  discovery.** The first test written to confirm the bug used
  `userEvent.tab()` and failed, as expected — but after writing the fix
  above, it *still* failed. The test itself turned out to be broken in a
  separate way: `@testing-library/user-event`'s own Tab-key handling
  (`getTabDestination`, which both `.tab()` and plain
  `.keyboard('{Tab}')` route through) finds "next focusable" candidates via
  `document.querySelectorAll(...)`, which also cannot see into a shadow
  root — so it can never find the real active element among its
  candidates, and always falls back to focusing `document.body`,
  regardless of whether Radix's trap is fixed or not. The original test's
  "confirmation" of the bug was real, but not for a reliable reason — it
  would have shown the identical failure even with a correct trap. The
  corrected test places focus at the known edge element directly, then
  dispatches only the raw keydown event (`element.dispatchEvent(new
  KeyboardEvent('keydown', {...}))`), bypassing `userEvent`'s own
  Tab-destination computation entirely while still exercising the real
  handler chain — the same dispatch approach the (correctly passing)
  Escape-key test already relied on. With that correction: both Tab
  (last→first) and Shift+Tab (first→last) wraparound pass, and all
  previously-passing tests (dismiss-on-click, outside-click,
  version-selection, all 11 original non-shadow `BibleVersionPicker`
  tests) remain green.

  **Worth remembering independent of this ADR**: testing real keyboard
  focus-navigation behavior for anything inside a shadow root cannot use
  `storybook/test`'s `userEvent.tab()` or `userEvent.keyboard('{Tab}')` at
  face value — both silently defocus everything via the same
  `document.querySelectorAll`-based blind spot, regardless of what's
  actually being tested.

  **Superseded in part — see "Trusted keyboard input is available after all"
  below.** The synthetic-keydown workaround described above is sound for
  testing the *edge* case (which is handled in JS, via `preventDefault()` plus
  a manual `.focus()`), but it is not a general substitute for a keypress: an
  untrusted `KeyboardEvent` never triggers the browser's native default
  action, so for any Tab that no JS handler intervenes on, it moves no focus
  at all and silently asserts nothing. Two real tab-order bugs lived in that
  gap; see below.
- **ARIA `aria-controls` resolves correctly** — verified, not just
  theorized. The commonly-cited "ARIA ID-references don't cross shadow
  boundaries" risk doesn't actually apply to this architecture: the
  trigger and the portaled dialog both end up inside the *same* shadow
  root (only the dialog is re-portaled; the trigger was never outside it to
  begin with), so the id-reference between them is a same-tree reference,
  not a cross-root one.
  `AriaControlsResolvesWithinTheSameShadowRoot` confirms
  `shadowRoot.getElementById(trigger's aria-controls)` resolves to the
  actual dialog element. This does **not** verify real screen-reader
  behavior (VoiceOver, NVDA, etc.) — only that the structural ARIA
  relationship stays intact; see Next Steps.

- **Trusted keyboard input is available in this harness after all — the
  earlier "this can't be tested here" conclusion was wrong.** The integration
  tests already run in Vitest **browser mode with the Playwright provider**
  (`packages/ui/vitest.config.ts`). `storybook/test` re-exports
  `@testing-library/user-event`, which simulates Tab in JS and has the
  shadow-DOM blind spot documented above — but browser mode exposes a
  *different* `userEvent`, backed by Playwright's CDP-level input:

  ```ts
  const { userEvent } = await import('vitest/browser');
  await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
  ```

  These are genuinely trusted events that exercise the browser's own native
  tab-order computation, which is the only way tab-order behavior can be
  tested for real. `cdp()` is exported from the same module for raw protocol
  access. Import it dynamically inside `play` so the story still loads in the
  Storybook dev UI, which is not browser mode. Every finding below was found
  with this and could not have been found without it.

- **The reported "Shift+Tab from the search input closes the popover" bug was
  not a Shadow DOM bug.** The search inputs in `bible-version-picker.tsx` and
  `bible-chapter-picker.tsx` carried `tabIndex={1}`. A **positive** tabindex
  places an element at the front of its tab-order scope irrespective of DOM
  position, so the input was not mid-sequence as it appeared — it was the
  *first* element, and Shift+Tab from it was a backwards exit off the front
  edge.

  A light-DOM control (identical trusted Shift+Tab, no `ShadowRootHost`)
  settled the causation: the broken tab order exists in **both** modes. In
  light DOM the backwards exit leaves the document for browser chrome,
  `activeElement` falls back to `body`, no `focusin` fires, and
  DismissableLayer never notices — a silent focus-loss bug. Inside a shadow
  tree the positive tabindex is scoped to that tree, so the exit instead lands
  on the *previous document-order focusable*, which is one of Radix's
  `useFocusGuards` spans in `document.body` — a real focusable element that
  fires `focusin`, which DismissableLayer correctly reads as "focus left" and
  dismisses. **Shadow DOM did not cause the bug; it converted a silent one
  into a visible one.**

  Note this also means neither Radix's `getTabbableCandidates` nor ours sorts
  by tabindex — both walk tree order — so any positive tabindex silently
  invalidates every `first`/`last` edge computation in the focus-trap path.
  Fixed by removing all three `tabIndex={1}` attributes; a regression test
  asserts `searchInput.tabIndex === 0` directly, so a reintroduction fails at
  the cause rather than resurfacing later as a mysterious dismiss.

- **`opacity: 0` does not remove anything from the tab order.**
  `BibleVersionPicker.Content` keeps its version panel and its language panel
  both mounted so the crossfade can animate, hiding the inactive one with
  `opacity-0`/`pointer-events-none`/`blur`/`scale`. None of those affect
  sequential focus navigation (only `display:none`, `visibility:hidden`, the
  `hidden` attribute, `inert`, or `tabindex="-1"` do), so Tab out of the
  search input walked through roughly ten focusable elements of an invisible
  panel — real focus, no visible focus ring anywhere on screen. Fixed with
  `inert` on whichever panel is inactive: it removes the subtree from both the
  tab order and the accessibility tree without touching layout, so the
  animation is unchanged (`visibility:hidden` would have killed the
  transition).

- **Tabbable-candidate selection has to mirror Radix's semantics, not just
  match a selector.** The custom handler's original query
  (`'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'`)
  matched roving-tabindex elements — inactive Radix Tabs triggers carry
  `tabindex="-1"`, and the `:not()` guard only applied to the last selector in
  the list — plus elements inside hidden or `inert` subtrees. Any of those can
  make `last` an element the user can never reach, so the *real* last
  element's Tab goes unhandled, which under Shadow DOM means an unexpected
  close rather than a mild focus leak. Now filtered through an `isTabbable`
  predicate checking disabled/hidden/negative-tabindex/`inert`/visibility.
  `inert` needs an explicit `closest('[inert]')` check: an inert element still
  reports `tabIndex === 0` and still has layout boxes, so it is invisible to
  both `tabIndex` and `checkVisibility()`.

- **Decided: keep Radix's focus loop.** Radix hardcodes `loop: true` on its
  popover FocusScope for all modalities (`trapped` is what varies), so Tab
  past the last element cycles to the first even for a non-modal popover.
  That is a divergence from the WAI-ARIA APG, which says a non-modal dialog
  should let Tab move focus out into the page — but it is not a WCAG 2.1.2
  keyboard trap, since Escape closes the popover and restores focus to the
  trigger. Kept as-is: the pickers are bounded selection tasks that take focus
  on open, cycling matches that, and diverging from Radix's default would make
  the SDK's popovers behave unlike every other Radix popover for no
  user-visible gain. The alternative — closing the popover on a genuine edge
  exit, per APG — remains available but would change behavior for every
  popover consumer, not just the shadow path. What is *not* acceptable is
  dropping the custom handler and letting native behavior decide, which yields
  looping in light DOM and closing in shadow DOM for the same component.

## Consequences

- Every shadow-wrapped component renders empty until the client mounts:
  `attachShadow` only runs in a `useEffect`, so there is no SSR content and
  an unavoidable flash-of-empty on first paint. Not solved here.
- `ShadowRootHost`/`useShadowRoot` are exported (`@internal`, unstable) from
  `@youversion/platform-react-ui` so any consumer of the built package —
  including this repo's own `*.shadow-isolation.stories.tsx` tests — can
  compose it around a component. This is a real, publishable surface change
  (changeset included) even though the API is explicitly not yet a
  supported public pattern.
- The shared `CSSStyleSheet` built from `__YV_STYLES__` is parsed once and
  adopted by every `ShadowRootHost` instance, so the cost doesn't scale
  per-instance — but each instance still duplicates Google Fonts `@import`
  processing relative to the head copy.
- **Accepted breaking change**, on purpose: consumers currently relying on
  the accidental CSS-override bug will see that styling silently stop
  applying on their next version bump of `@youversion/platform-react-ui`,
  with no runtime error. Handled through the normal changeset/changelog
  process, not a migration tool — the release that ships full lockdown
  should call this out explicitly by name in its changeset, with the
  supported replacement (props / specified variables / headless layer)
  named, so it's discoverable by anyone debugging a post-bump visual diff.

## Next Steps

In priority order — this is the actual plan, not an undifferentiated list:

1. **Verify focus-trap and ARIA behavior on Popover.** *Was marked Done; that
   was premature.* Focus-trap wraparound was found genuinely broken, fixed,
   and re-verified, and `aria-controls` id-referencing was verified
   structurally intact — but the verification rested on synthetic keydown
   events, which cannot move focus at all. Once trusted Playwright input was
   used (see Findings), **three further keyboard defects surfaced
   immediately**: positive `tabIndex` on the search inputs, an invisible but
   fully tabbable language panel, and over-broad tabbable-candidate
   selection. All three are now fixed and covered by regression tests using
   trusted input.

   The lesson generalizes past this ADR: **any keyboard-behavior claim in
   this repo that was verified only with `storybook/test`'s `userEvent` or a
   dispatched `KeyboardEvent` should be treated as unverified.** Neither
   moves focus the way a real keypress does.

   **Still open:** real assistive-technology behavior (VoiceOver/NVDA
   actually announcing the popover correctly) has not been tested — only the
   structural ARIA relationship has. Worth a manual pass before calling
   Popover fully cleared. Also unaudited: whether other SDK components hide
   content with `opacity`/`visibility` in ways that leave it in the tab
   order — the two occurrences in `bible-version-picker.tsx` are the only
   `opacity-0` panel-hiding in the component set today, but nothing prevents
   the pattern from being reintroduced, and it fails silently.
2. **Bring Radix Dialog to parity with Popover** — same `container`-redirect
   pattern applied to `packages/ui/src/components/ui/dialog.tsx`, tested
   against `sign-in-dialog.tsx` or `highlight-permission-dialog.tsx`.
   Popover's finding does not automatically extend to Dialog; it's a
   different primitive with its own internals.
3. **Resolve the portal-clipping-vs-body-escape tension before wide
   rollout.** Radix normally portals to `document.body` specifically to
   escape ancestor `overflow`/clipping. Redirecting into a *local* shadow
   root (nested wherever the consumer placed the component) reintroduces
   that clipping risk for anything placed inside a scroll- or
   overflow-constrained host container — untested so far, and a real design
   question (e.g. where shadow roots structurally attach), not just more
   code, once multiple components are involved.
4. **Design and build the specified-CSS-vars customization layer** (see
   Decision) — curating which `--yv-*` tokens are public API, and rewriting
   that subset with the `var(--x, <default>)` fallback pattern. Independent
   of 1–3; can run in parallel.
5. **Decision: no dedicated pre-launch prop-API audit.** The existing prop
   surface (e.g. `YouVersionAuthButton`'s `radius`/`size`/`variant`/`mode`;
   `BibleReader.Root`'s `fontSize`/`lineHeight`/`fontFamily`/
   `showVerseNumbers`; `VerseOfTheDay`'s `showSunIcon`/`showShareButton`/
   `showBibleAppAttribution`; `BibleVersionPicker.Root`'s `side`; `background`
   broadly) is assumed sufficient as a starting point rather than verified
   up front. A gap surfacing after release is treated as ordinary,
   reactive product work — a normal prop-addition request — not evidence
   the plan was wrong. The one thing this decision does raise: with no CSS
   fallback left, a consumer who hits a real gap is fully blocked until
   that prop ships, not just inconvenienced — so turnaround time on those
   requests matters more post-launch than it would for a typical backlog
   item, even though nothing is required to change about the launch plan
   itself.
6. **Roll out to the rest of the component surface** — baking shadow
   rendering into each remaining exported component internally (no
   consumer-facing wrapper, per the "drop it in, it's just isolated"
   requirement), plus one explicit shared-shadow-root decision per compound
   component (`BibleReader.Root`/`.Content`/`.Toolbar`,
   `BibleChapterPicker`, `BibleVersionPicker`), not one shadow root per
   sub-part.
7. **Longer-horizon, can trail the above:** real code review from beyond
   the one engineer who ran this spike; cross-browser verification (testing
   so far is Chromium-only, via Playwright); SSR-flash mitigation research
   (declarative Shadow DOM); Untitled Serif / `@font-face`-crossing-the-
   boundary verification, which needs a component that actually renders
   serif text; productionizing `ShadowRootHost`/`useShadowRoot` from
   `@internal`/unstable to a documented, stable pattern.
