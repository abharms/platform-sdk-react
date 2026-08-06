/**
 * A representative excerpt of a host app's unlayered global CSS — the exact
 * shape of bug described in the Shadow DOM style-isolation spike (see
 * docs/adr/0005-shadow-dom-style-isolation.md). Mirrors the `button {}`
 * rule from the local (not shipped in this repo) reproduction harness used
 * to originally demonstrate the bug.
 *
 * This is a plain unlayered rule: no `@layer`, no elevated specificity. Per
 * the CSS cascade, ANY unlayered author-origin declaration beats ANY layered
 * author-origin declaration (like the SDK's `@layer yv-sdk-*` styles)
 * regardless of selector specificity or order — that's the bug this file
 * exists to reproduce in a test.
 *
 * Kept as a TS string constant, not a `.css` file: packages/ui/CLAUDE.md
 * forbids adding global CSS files to this package.
 */
export const HOSTILE_BUTTON_CSS = `
button {
  font-family: 'Comic Sans MS', 'Chalkboard SE', cursive;
  font-size: 15px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: #ffffff;
  background: #b91c1c;
  border: 3px solid #000000;
  border-radius: 0;
  padding: 14px 22px;
}
`;

/**
 * The *other* style-bleed vector, and the one Shadow DOM does NOT block on its
 * own: INHERITED properties. Unlike `HOSTILE_BUTTON_CSS` (a `button {}` type
 * selector, which the shadow boundary blocks because selectors can't match
 * across it), this sets inherited text properties on an ancestor (`body`).
 * Inherited values propagate parent→child and cross the shadow boundary by
 * spec, so without the `:host { all: initial }` reset in global.css these
 * would still reach a shadow-wrapped component.
 *
 * Every property here is inherited (verified against MDN). Used by
 * `YouVersionAuthButton.shadow-isolation.stories.tsx` to prove the reset.
 * See docs/adr/0005-shadow-dom-style-isolation.md.
 */
export const HOSTILE_INHERITED_CSS = `
body {
  letter-spacing: 0.35em;
  word-spacing: 0.5em;
  text-transform: uppercase;
  font-style: italic;
}
`;

/**
 * The sharpest inherited-property vector: a universal `!important` rule. Unlike
 * `HOSTILE_INHERITED_CSS` (which sets inherited props on `body`, an ancestor),
 * `*` also matches the shadow HOST element itself. On the host, an outer
 * author-important declaration outranks the SDK's normal `:host` reset (and even
 * a `:host { all: initial !important }`, per cross-shadow scoping) — so before
 * the reset was moved onto an inner `[data-yv-shadow-content]` wrapper, these
 * values inherited straight into the shadow content.
 *
 * The inner wrapper reset defeats this because no outer selector can match an
 * element inside a shadow tree. Used by the shadow-isolation stories to prove it.
 * See docs/adr/0005-shadow-dom-style-isolation.md.
 */
export const HOSTILE_UNIVERSAL_IMPORTANT_CSS = `
* {
  color: #d600d6 !important;
  font-family: 'Comic Sans MS', 'Chalkboard SE', cursive !important;
  letter-spacing: 0.25em !important;
  text-transform: uppercase !important;
}
`;

/**
 * CSS custom-property vector. `all: initial` deliberately does NOT reset custom
 * properties, and they inherit across the shadow boundary, so a host that
 * overrides a var the SDK resolves at runtime without a shadow-local definition
 * would bleed in. The real leak is bare `var(--spacing)` (from the unprefixed
 * tw-animate-css import AND an SDK arbitrary value in bible-version-picker),
 * neutralized by declaring `--spacing` on the `[data-yv-shadow-content]` wrapper.
 * Every other var is already safe (`--yv-*` are shadow-local; `--tw-*` are
 * `@property { inherits: false }`; `input-group`'s `--radius` was namespaced to
 * `--yv-radius` at source).
 *
 * See docs/adr/0005-shadow-dom-style-isolation.md.
 */
export const HOSTILE_CUSTOM_PROPS_CSS = `
:root, * {
  --spacing: 48px !important;
}
`;

/**
 * Every non-`@font-face` vector at once — the full barrage the all-exports
 * regression harness fires at each component (see
 * `all-exports.shadow-isolation.stories.tsx`). Deliberately excludes the
 * `@font-face` hijack: font faces are document-scoped and reach inside shadow
 * roots by design, so it's the one known, documented, deferred leak (ADR-0005)
 * and would false-fail an otherwise-correct component. Everything here — type
 * selectors, inherited props, host-targeting `!important`, and custom properties
 * — MUST be fully blocked by the isolation wrapper.
 */
export const HOSTILE_ALL_VECTORS_CSS = [
  HOSTILE_BUTTON_CSS,
  HOSTILE_INHERITED_CSS,
  HOSTILE_UNIVERSAL_IMPORTANT_CSS,
  HOSTILE_CUSTOM_PROPS_CSS,
].join('\n');
