import { expect, waitFor } from 'storybook/test';
import { getShadowRoot } from './shadow-dom-test-utils';
import { HOSTILE_INHERITED_CSS, HOSTILE_ALL_VECTORS_CSS } from './hostile-host-styles';

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

// Computed-style properties the hostile barrage targets. Compared before/after on
// every element in a component's shadow tree to prove none of them shift. Kebab
// names + getPropertyValue so standard props and the custom property read the same
// way.
const ISOLATION_PROBE_PROPS = [
  'color',
  'background-color',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'line-height',
  'letter-spacing',
  'word-spacing',
  'text-transform',
  'border-top-left-radius',
  'padding-left',
  '--spacing',
] as const;

/**
 * Generic isolation proof used by the all-exports regression harness
 * (`all-exports.shadow-isolation.stories.tsx`): snapshots the probed computed
 * styles of EVERY element in a component's shadow tree, injects the full hostile
 * barrage (`HOSTILE_ALL_VECTORS_CSS`), then asserts nothing changed.
 *
 * Snapshot → inject → re-read runs synchronously against the same element
 * references, so no async content update can interleave and cause a false diff;
 * any difference is therefore real host-CSS bleed. `@font-face` is excluded from
 * the barrage (the one documented, deferred leak — see the fixture).
 */
export async function assertComponentIsolated(
  canvasElement: HTMLElement,
  opts: { styleId: string },
): Promise<void> {
  const shadowRoot = await getShadowRoot(canvasElement);
  // Wait until the component has actually rendered content into its shadow root.
  await waitFor(() => {
    if (shadowRoot.querySelectorAll('*').length < 2) {
      throw new Error('shadow root has not rendered content yet');
    }
  });

  const elements = Array.from(shadowRoot.querySelectorAll<HTMLElement>('*'));
  const before = elements.map((el) => {
    const cs = getComputedStyle(el);
    return ISOLATION_PROBE_PROPS.map((prop) => cs.getPropertyValue(prop).trim());
  });

  const host = hostStyleController(opts.styleId, HOSTILE_ALL_VECTORS_CSS);
  try {
    host.inject();
    // Re-read the SAME elements synchronously (no await) so content can't change
    // between snapshots — any diff is pure CSS bleed.
    elements.forEach((el, elIndex) => {
      const cs = getComputedStyle(el);
      const label = `<${el.tagName.toLowerCase()} class="${el.getAttribute('class') ?? ''}">`;
      ISOLATION_PROBE_PROPS.forEach((prop, propIndex) => {
        void expect(
          cs.getPropertyValue(prop).trim(),
          `${label} "${prop}" changed under hostile CSS`,
        ).toBe(before[elIndex]?.[propIndex]);
      });
    });
  } finally {
    host.remove();
  }
}
