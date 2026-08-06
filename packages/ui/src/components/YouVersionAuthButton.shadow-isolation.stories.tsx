import { ShadowRootHost } from '@/lib/shadow-root-host';
import { ShadowIsolationOverrideProvider } from '@/lib/shadow-isolation';
import { HOSTILE_BUTTON_CSS, HOSTILE_INHERITED_CSS } from '@/test/hostile-host-styles';
import { getShadowRoot } from '@/test/shadow-dom-test-utils';
import { hostStyleController } from '@/test/shadow-isolation-story-utils';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { createRef } from 'react';
import { expect, fn, spyOn, userEvent, waitFor } from 'storybook/test';
import { YouVersionAuthButton } from './YouVersionAuthButton';

/**
 * Proves the Shadow DOM style-isolation spike actually fixes the bug: a
 * host app's unlayered global CSS (e.g. a plain `button {}` rule) overrides
 * the SDK's `@layer yv-sdk-*` styles no matter how specific the SDK's
 * selectors are, because unlayered author-origin CSS always outranks
 * layered author-origin CSS.
 *
 * `YouVersionAuthButton` has no Radix Portal/Dialog, so this only tests
 * style isolation — Radix-in-shadow-root behavior is a separate, deferred
 * concern (see docs/adr/0005-shadow-dom-style-isolation.md).
 */

let signInMock: ReturnType<typeof fn>;

const meta = {
  title: 'Spikes/YouVersionAuthButton (Shadow DOM)',
  component: YouVersionAuthButton,
  tags: ['autodocs'],
  async beforeEach() {
    const { YouVersionAPIUsers } = await import('@youversion/platform-core');
    signInMock = fn().mockImplementation(() =>
      Promise.resolve({
        accessToken: 'mock-token',
        errorMsg: null,
        yvpUserId: 'mock-user-id',
      }),
    );
    spyOn(YouVersionAPIUsers, 'signIn')
      .mockImplementation(signInMock)
      .mockName('YouVersionAPIUsers.signIn');
  },
} satisfies Meta<typeof YouVersionAuthButton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const StyleIsolation: Story = {
  tags: ['integration'],
  render: () => (
    <div style={{ display: 'flex', gap: 24 }}>
      <YouVersionAuthButton data-testid="control-button" />
      <ShadowRootHost>
        <YouVersionAuthButton data-testid="shadow-button" />
      </ShadowRootHost>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const hostStyle = hostStyleController('shadow-isolation-hostile-style', HOSTILE_BUTTON_CSS);

    let controlButtonMaybe: HTMLButtonElement | null = null;
    await waitFor(() => {
      controlButtonMaybe = canvasElement.querySelector<HTMLButtonElement>(
        '[data-testid="control-button"]',
      );
      if (!controlButtonMaybe) throw new Error('control button not found');
    });
    if (!controlButtonMaybe) throw new Error('control button not found');
    const controlButton: HTMLButtonElement = controlButtonMaybe;

    const shadowRoot = await getShadowRoot(canvasElement);
    let shadowButtonMaybe: HTMLButtonElement | null = null;
    await waitFor(() => {
      shadowButtonMaybe = shadowRoot.querySelector<HTMLButtonElement>(
        '[data-testid="shadow-button"]',
      );
      if (!shadowButtonMaybe) throw new Error('shadow button not found');
    });
    if (!shadowButtonMaybe) throw new Error('shadow button not found');
    const shadowButton: HTMLButtonElement = shadowButtonMaybe;

    // Baseline, before the hostile host stylesheet exists.
    const controlBaselineFont = getComputedStyle(controlButton).fontFamily;
    const shadowBaselineFont = getComputedStyle(shadowButton).fontFamily;
    const shadowBaselineBg = getComputedStyle(shadowButton).backgroundColor;

    try {
      hostStyle.inject();

      await waitFor(() => {
        // Self-check: the control button MUST be affected by the hostile
        // stylesheet, or this test would be proving nothing. If this ever
        // starts failing, the fixture no longer reproduces the bug.
        const controlAfter = getComputedStyle(controlButton);
        void expect(controlAfter.fontFamily).not.toBe(controlBaselineFont);
        void expect(controlAfter.backgroundColor).toBe('rgb(185, 28, 28)');
      });

      // The shadow-DOM button must be completely unaffected.
      const shadowAfter = getComputedStyle(shadowButton);
      void expect(shadowAfter.fontFamily).toBe(shadowBaselineFont);
      void expect(shadowAfter.backgroundColor).toBe(shadowBaselineBg);
      void expect(shadowAfter.backgroundColor).not.toBe('rgb(185, 28, 28)');
    } finally {
      hostStyle.remove();
    }
  },
};

/**
 * The complement to `StyleIsolation`. That story proves the shadow boundary
 * blocks a `button {}` *selector*. This one proves the separate, harder vector:
 * INHERITED properties (`body { text-transform; letter-spacing; ... }`) cross
 * the boundary by spec, and are stopped only by the `:host { all: initial }`
 * reset in global.css.
 *
 * The subjects here are plain <div>s, NOT YouVersionAuthButton, on purpose: a
 * <button> is a form control whose UA stylesheet already resets inherited text
 * properties (text-transform/letter-spacing/font-*) on the control, insulating
 * its whole subtree — so it cannot demonstrate the inheritance bleed. Most SDK
 * text (BibleReader, cards, popovers) is NOT inside a form control and does
 * inherit, so a plain element is the faithful probe for that vector.
 *
 * NOTE: `__YV_STYLES__` is injected from the pre-built dist/tailwind.css (see
 * .storybook/main.ts), so this fails until `pnpm build:css` has run with the
 * reset present.
 */
export const InheritedStyleIsolation: Story = {
  tags: ['integration'],
  // This story renders plain <div>s, not the auth button — it has no reason to
  // spin up the auth provider (which would also require the auth-redirect env
  // var). Opt out so it doesn't pull in auth it doesn't use.
  parameters: { includeAuth: false },
  render: () => (
    <div style={{ display: 'flex', gap: 24 }}>
      <div data-testid="control-text">YouVersion</div>
      <ShadowRootHost>
        <div data-testid="shadow-text">YouVersion</div>
      </ShadowRootHost>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const hostStyle = hostStyleController(
      'shadow-inherited-isolation-hostile-style',
      HOSTILE_INHERITED_CSS,
    );

    let controlTextMaybe: HTMLDivElement | null = null;
    await waitFor(() => {
      controlTextMaybe = canvasElement.querySelector<HTMLDivElement>(
        '[data-testid="control-text"]',
      );
      if (!controlTextMaybe) throw new Error('control text not found');
    });
    if (!controlTextMaybe) throw new Error('control text not found');
    const controlText: HTMLDivElement = controlTextMaybe;

    const shadowRoot = await getShadowRoot(canvasElement);
    let shadowTextMaybe: HTMLDivElement | null = null;
    await waitFor(() => {
      shadowTextMaybe = shadowRoot.querySelector<HTMLDivElement>('[data-testid="shadow-text"]');
      if (!shadowTextMaybe) throw new Error('shadow text not found');
    });
    if (!shadowTextMaybe) throw new Error('shadow text not found');
    const shadowText: HTMLDivElement = shadowTextMaybe;

    // Baseline, before the hostile host stylesheet exists.
    const shadowBaselineTextTransform = getComputedStyle(shadowText).textTransform;
    const shadowBaselineLetterSpacing = getComputedStyle(shadowText).letterSpacing;

    try {
      hostStyle.inject();

      await waitFor(() => {
        // Self-check: the light-DOM control MUST inherit the hostile styles, or
        // the fixture isn't reproducing the inherited-property bleed and this
        // test proves nothing.
        const controlAfter = getComputedStyle(controlText);
        void expect(controlAfter.textTransform).toBe('uppercase');
        void expect(controlAfter.letterSpacing).not.toBe('normal');
      });

      // The shadow-DOM element must be completely unaffected: `:host { all:
      // initial }` breaks the inheritance chain at the boundary.
      const shadowAfter = getComputedStyle(shadowText);
      void expect(shadowAfter.textTransform).toBe(shadowBaselineTextTransform);
      void expect(shadowAfter.textTransform).not.toBe('uppercase');
      void expect(shadowAfter.letterSpacing).toBe(shadowBaselineLetterSpacing);
    } finally {
      hostStyle.remove();
    }
  },
};

/**
 * Proves DEFAULT-ON isolation: a bare `<YouVersionAuthButton />` with NO
 * `ShadowRootHost` wrapper isolates itself. The raw <button> beside it is the
 * light-DOM control the hostile `button {}` rule clobbers. Note the SDK button
 * is reachable only through the shadow root it created for itself — that same
 * fact is why light-DOM Testing Library queries stop finding it once default-on
 * ships (see docs/adr/0005-shadow-dom-style-isolation.md).
 */
export const DefaultOnIsolation: Story = {
  tags: ['integration'],
  render: () => (
    // Force isolation ON (Storybook disables it by default via preview.tsx) so
    // this proves the bare component self-wraps with no explicit ShadowRootHost.
    <ShadowIsolationOverrideProvider value={false}>
      <div style={{ display: 'flex', gap: 24 }}>
        <button type="button" data-testid="raw-control">
          raw
        </button>
        <YouVersionAuthButton data-testid="default-on-button" />
      </div>
    </ShadowIsolationOverrideProvider>
  ),
  play: async ({ canvasElement }) => {
    const hostStyle = hostStyleController('default-on-hostile-style', HOSTILE_BUTTON_CSS);

    // The SDK button self-isolates, so its <button> lives inside the
    // ShadowRootHost it created for itself — reachable only via the shadow root,
    // not the light-DOM canvas.
    const shadowRoot = await getShadowRoot(canvasElement);
    let shadowButtonMaybe: HTMLButtonElement | null = null;
    await waitFor(() => {
      shadowButtonMaybe = shadowRoot.querySelector<HTMLButtonElement>(
        '[data-testid="default-on-button"]',
      );
      if (!shadowButtonMaybe) throw new Error('default-on button not found in its shadow root');
    });
    if (!shadowButtonMaybe) throw new Error('default-on button not found in its shadow root');
    const shadowButton: HTMLButtonElement = shadowButtonMaybe;

    let rawControlMaybe: HTMLButtonElement | null = null;
    await waitFor(() => {
      rawControlMaybe = canvasElement.querySelector<HTMLButtonElement>(
        '[data-testid="raw-control"]',
      );
      if (!rawControlMaybe) throw new Error('raw control not found');
    });
    if (!rawControlMaybe) throw new Error('raw control not found');
    const rawControl: HTMLButtonElement = rawControlMaybe;

    const shadowBaselineBg = getComputedStyle(shadowButton).backgroundColor;

    try {
      hostStyle.inject();

      await waitFor(() => {
        // Self-check: the raw light-DOM <button> MUST be clobbered by `button {}`.
        void expect(getComputedStyle(rawControl).backgroundColor).toBe('rgb(185, 28, 28)');
      });

      // The self-isolated SDK button must be untouched — no wrapper needed.
      const shadowAfter = getComputedStyle(shadowButton);
      void expect(shadowAfter.backgroundColor).toBe(shadowBaselineBg);
      void expect(shadowAfter.backgroundColor).not.toBe('rgb(185, 28, 28)');
    } finally {
      hostStyle.remove();
    }
  },
};

const refProbeRef = createRef<HTMLButtonElement>();

export const RefAndEventsAcrossShadowBoundary: Story = {
  tags: ['integration'],
  render: () => (
    <ShadowRootHost>
      <YouVersionAuthButton ref={refProbeRef} data-testid="ref-probe-button" />
    </ShadowRootHost>
  ),
  play: async ({ canvasElement }) => {
    const shadowRoot = await getShadowRoot(canvasElement);

    await waitFor(() => {
      void expect(refProbeRef.current).toBeInstanceOf(HTMLButtonElement);
    });

    // forwardRef resolves to the real DOM node inside the shadow tree, not a
    // stale or wrong node — the React element tree (not the portal's DOM
    // destination) is what ref resolution follows.
    void expect(refProbeRef.current?.getRootNode()).toBe(shadowRoot);

    const button = shadowRoot.querySelector<HTMLButtonElement>('[data-testid="ref-probe-button"]');
    if (!button) throw new Error('ref probe button not found in shadow root');
    void expect(button).toBe(refProbeRef.current);

    // The button is disabled while the initial auth check is in flight.
    await waitFor(() => {
      void expect(button.disabled).toBe(false);
    });

    await userEvent.click(button);
    await waitFor(() => {
      void expect(signInMock).toHaveBeenCalled();
    });
  },
};
