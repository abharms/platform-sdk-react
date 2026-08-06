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
 * Reusable proof that a shadow-isolated subject blocks a hostile host stylesheet
 * while an un-isolated light-DOM `control` does not. The calling story renders a
 * light-DOM `control` (un-isolated: the Storybook escape hatch disables isolation
 * by default) and a `subject` inside a `ShadowRootHost` (forced to isolate).
 *
 * Injects `css`, self-checks that the control WAS clobbered
 * (`assertControlClobbered` — proves the fixture reproduces the bleed), then
 * asserts every value read by `probe` is unchanged on the shadow subject. `probe`
 * reads the properties under test off a computed style, so it handles standard
 * props (`s.textTransform`) and custom properties (`s.getPropertyValue('--x')`)
 * alike. `control`/`subject` are CSS selectors for the two elements.
 *
 * See docs/adr/0005-shadow-dom-style-isolation.md.
 */
export async function assertStyleIsolation(
  canvasElement: HTMLElement,
  opts: {
    control: string;
    subject: string;
    css: string;
    styleId: string;
    probe: (style: CSSStyleDeclaration) => Record<string, string>;
    assertControlClobbered: (probed: Record<string, string>) => void;
  },
): Promise<void> {
  const host = hostStyleController(opts.styleId, opts.css);

  const control = await waitForEl(
    () => canvasElement.querySelector<HTMLElement>(opts.control),
    'control element',
  );

  const shadowRoot = await getShadowRoot(canvasElement);
  const subject = await waitForEl(
    () => shadowRoot.querySelector<HTMLElement>(opts.subject),
    'shadow subject element',
  );

  const subjectBaseline = opts.probe(getComputedStyle(subject));

  try {
    host.inject();

    // Self-check: the light-DOM control MUST be clobbered, or the fixture isn't
    // reproducing the bleed and this proves nothing.
    await waitFor(() => opts.assertControlClobbered(opts.probe(getComputedStyle(control))));

    // The shadow-isolated subject must be untouched on every probed value.
    const subjectAfter = opts.probe(getComputedStyle(subject));
    for (const key of Object.keys(subjectBaseline)) {
      void expect(subjectAfter[key]).toBe(subjectBaseline[key]);
    }
  } finally {
    host.remove();
  }
}

/**
 * `assertStyleIsolation` specialized to the inherited-property vector
 * (`HOSTILE_INHERITED_CSS`, probing `text-transform`/`letter-spacing` — inherited
 * props the SDK doesn't set on text). `control`/`subject` should point at a
 * text-bearing element.
 */
export function assertInheritedStyleIsolation(
  canvasElement: HTMLElement,
  opts: { control: string; subject: string; styleId?: string },
): Promise<void> {
  return assertStyleIsolation(canvasElement, {
    control: opts.control,
    subject: opts.subject,
    css: HOSTILE_INHERITED_CSS,
    styleId: opts.styleId ?? 'hostile-inherited-style',
    probe: (s) => ({ textTransform: s.textTransform, letterSpacing: s.letterSpacing }),
    assertControlClobbered: (p) => {
      void expect(p.textTransform).toBe('uppercase');
      void expect(p.letterSpacing).not.toBe('normal');
    },
  });
}
