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
