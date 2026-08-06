import { describe, expect, it } from 'vitest';
import { scopeThemeToShadowWrapper } from '../../scripts/scope-theme-to-shadow-wrapper.mjs';

describe('scopeThemeToShadowWrapper', () => {
  it.each([
    ':root,:host{--yv-spacing:.25rem;--yv-radius-2xl:1rem}',
    ':root, :host {\n  --yv-spacing: .25rem;\n  --yv-radius-2xl: 1rem;\n}',
  ])('adds the shadow wrapper to formatted and minified Tailwind output', (css) => {
    const scoped = scopeThemeToShadowWrapper(css);

    expect(scoped).toContain('[data-yv-shadow-content]');
    expect(scoped).toContain('--yv-spacing');
    expect(scoped).toContain('--yv-radius-2xl');
  });

  it('is idempotent', () => {
    const once = scopeThemeToShadowWrapper(':root, :host { --yv-spacing: .25rem; }');
    expect(scopeThemeToShadowWrapper(once)).toBe(once);
  });

  it('fails closed when Tailwind no longer emits the expected theme rule', () => {
    expect(() => scopeThemeToShadowWrapper(':root { --yv-spacing: .25rem; }')).toThrow(
      'expected exactly one Tailwind theme rule',
    );
  });
});
