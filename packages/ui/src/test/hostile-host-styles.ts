/**
 * A representative excerpt of a host app's unlayered global CSS — the exact
 * shape of bug described in the Shadow DOM style-isolation spike (see
 * docs/adr/0005-shadow-dom-style-isolation-spike.md). Mirrors the `button {}`
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
 * See docs/adr/0005-shadow-dom-style-isolation-spike.md.
 */
export const HOSTILE_INHERITED_CSS = `
body {
  letter-spacing: 0.35em;
  word-spacing: 0.5em;
  text-transform: uppercase;
  font-style: italic;
}
`;
