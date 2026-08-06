// Scope Tailwind's generated theme tokens to the shadow-isolation wrapper.
// ======================================================================
// Tailwind v4 emits its `@theme` custom properties (all the `--yv-*` tokens:
// spacing, radii, container widths, type scale, fonts, easings, …) on
// `:root, :host`. `:host` is the LIGHT-DOM shadow host, so a hostile page rule
// like `* { --yv-spacing: 48px !important }` matches it, outranks the normal
// `:host` declaration, and the value inherits down into shadow-isolated
// components (the `[data-yv-shadow-content]` `all: initial` reset can't undo it —
// `all` does not touch custom properties). Those tokens feed nearly every
// generated utility, so this distorts padding, gaps, sizing, radius, and type.
//
// Fix: re-emit the exact same theme block on the inner reset wrapper
// `[data-yv-shadow-content]`, which lives INSIDE the shadow tree and therefore
// cannot be matched by any host selector. Its copy is a *specified* value that
// wins over the inherited (hijacked) one, and it can't itself be hijacked.
//
// Applied at the build boundary (build:css) AND when Storybook reads the CSS
// (.storybook/main.ts), so the fix is present in every path that produces
// __YV_STYLES__ — including the `tailwindcss --watch` dev flow, which would
// otherwise regenerate the file without it. Uses Tailwind's own generated values
// (not hand-written literals) so they can never drift.
// See docs/adr/0005-shadow-dom-style-isolation.md.

import { existsSync, readFileSync, watch, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basename, dirname, resolve } from 'node:path';
import postcss from 'postcss';

const SHADOW_CONTENT_SELECTOR = '[data-yv-shadow-content]';

/**
 * Add `[data-yv-shadow-content]` to Tailwind's generated `:root, :host` theme
 * block. Parsing CSS rather than matching its minified text makes this work for
 * both production and Tailwind's formatted `--watch` output. It is idempotent
 * and fails loudly if Tailwind changes the expected rule shape.
 * @param {string} css
 * @returns {string}
 */
export function scopeThemeToShadowWrapper(css) {
  const root = postcss.parse(css);
  const matches = [];

  root.walkRules((rule) => {
    const selectors = rule.selectors.map((selector) => selector.trim());
    if (selectors.includes(':root') && selectors.includes(':host')) matches.push(rule);
  });

  if (matches.length !== 1) {
    throw new Error(
      'scope-theme-to-shadow-wrapper: expected exactly one Tailwind theme rule containing ' +
        'both :root and :host; found ' +
        `${matches.length}. Tailwind's output changed — re-verify the theme selector.`,
    );
  }

  const [themeRule] = matches;
  if (!themeRule.selectors.includes(SHADOW_CONTENT_SELECTOR)) {
    themeRule.selectors = [...themeRule.selectors, SHADOW_CONTENT_SELECTOR];
  }

  return root.toString();
}

function transformFile(inputPath, outputPath = inputPath) {
  if (!existsSync(inputPath)) return;
  const sourceCss = readFileSync(inputPath, 'utf8');
  const scopedCss = scopeThemeToShadowWrapper(sourceCss);
  if (scopedCss !== sourceCss || inputPath !== outputPath) writeFileSync(outputPath, scopedCss);
}

// CLI: transform a file in place, or keep a scoped output in sync with a
// Tailwind `--watch` input file.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const watching = args[0] === '--watch';
  const paths = watching ? args.slice(1) : args;
  const defaultPath = resolve(dirname(fileURLToPath(import.meta.url)), '../dist/tailwind.css');
  const inputPath = resolve(paths[0] ?? defaultPath);
  const outputPath = resolve(paths[1] ?? inputPath);

  const run = () => {
    transformFile(inputPath, outputPath);
    console.log('✅ Scoped Tailwind theme tokens to [data-yv-shadow-content] (shadow isolation)');
  };
  run();

  if (watching) {
    watch(dirname(inputPath), (_event, filename) => {
      if (filename === basename(inputPath)) run();
    });
  }
}
