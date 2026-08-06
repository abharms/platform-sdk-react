import { expect, waitFor } from 'storybook/test';
import { getShadowRoot } from './shadow-dom-test-utils';
import { HOSTILE_INHERITED_CSS } from './hostile-host-styles';

/** Injects/removes a hostile host `<style>` tag the way a bundled consumer app would. */
export function hostStyleController(
  id: string,
  css: string,
): { inject: () => void; remove: () => void } {
  return {
    inject() {
      const el = document.createElement('style');
      el.id = id;
      el.textContent = css;
      document.head.append(el);
    },
    remove() {
      document.getElementById(id)?.remove();
    },
  };
}

export function waitForEl(get: () => HTMLElement | null, label: string): Promise<HTMLElement> {
  return waitFor(() => {
    const el = get();
    if (!el) throw new Error(`${label} not found`);
    return el;
  });
}

/**
 * Reusable proof that a default-on component blocks host CSS. The calling story
 * renders two copies of a text-bearing element:
 * - a light-DOM `control` (rendered un-isolated because the Storybook escape
 *   hatch disables isolation by default), and
 * - a `subject` inside `<ShadowIsolationOverrideProvider value={false}>` (forced
 *   to isolate itself in a shadow root).
 *
 * It injects hostile INHERITED CSS (`body { text-transform; letter-spacing; … }`
 * from `HOSTILE_INHERITED_CSS`), then asserts the light-DOM control DID inherit
 * it (self-check — proves the fixture reproduces the bleed) while the
 * shadow-isolated subject did NOT (`:host { all: initial }` blocks it). Probes
 * `text-transform`/`letter-spacing` (inherited, not set by the SDK on text), so
 * `control` and `subject` should point at a text-bearing element.
 *
 * See docs/adr/0005-shadow-dom-style-isolation.md.
 */
export async function assertInheritedStyleIsolation(
  canvasElement: HTMLElement,
  opts: { control: string; subject: string; styleId?: string },
): Promise<void> {
  const host = hostStyleController(
    opts.styleId ?? 'hostile-inherited-style',
    HOSTILE_INHERITED_CSS,
  );

  const control = await waitForEl(
    () => canvasElement.querySelector<HTMLElement>(opts.control),
    'control element',
  );

  const shadowRoot = await getShadowRoot(canvasElement);
  const subject = await waitForEl(
    () => shadowRoot.querySelector<HTMLElement>(opts.subject),
    'shadow subject element',
  );

  const subjectBaselineTextTransform = getComputedStyle(subject).textTransform;
  const subjectBaselineLetterSpacing = getComputedStyle(subject).letterSpacing;

  try {
    host.inject();

    await waitFor(() => {
      // Self-check: the light-DOM control MUST inherit the hostile styles, or the
      // fixture isn't reproducing the bleed and this proves nothing.
      const controlAfter = getComputedStyle(control);
      void expect(controlAfter.textTransform).toBe('uppercase');
      void expect(controlAfter.letterSpacing).not.toBe('normal');
    });

    // The shadow-isolated subject must be untouched.
    const subjectAfter = getComputedStyle(subject);
    void expect(subjectAfter.textTransform).toBe(subjectBaselineTextTransform);
    void expect(subjectAfter.textTransform).not.toBe('uppercase');
    void expect(subjectAfter.letterSpacing).toBe(subjectBaselineLetterSpacing);
  } finally {
    host.remove();
  }
}
