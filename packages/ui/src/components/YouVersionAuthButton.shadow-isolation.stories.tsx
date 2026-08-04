import { createRef } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, spyOn, userEvent, waitFor } from 'storybook/test';
import { YouVersionAuthButton } from './YouVersionAuthButton';
import { ShadowRootHost } from '@/lib/shadow-root-host';
import { getShadowRoot } from '@/test/shadow-dom-test-utils';
import { HOSTILE_BUTTON_CSS } from '@/test/hostile-host-styles';

/**
 * Proves the Shadow DOM style-isolation spike actually fixes the bug: a
 * host app's unlayered global CSS (e.g. a plain `button {}` rule) overrides
 * the SDK's `@layer yv-sdk-*` styles no matter how specific the SDK's
 * selectors are, because unlayered author-origin CSS always outranks
 * layered author-origin CSS.
 *
 * `YouVersionAuthButton` has no Radix Portal/Dialog, so this only tests
 * style isolation — Radix-in-shadow-root behavior is a separate, deferred
 * concern (see docs/adr/0005-shadow-dom-style-isolation-spike.md).
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

/** Injects/removes a host-style `<style>` tag the same way a bundled consumer app would. */
function hostStyleTagController(id: string) {
  const inject = () => {
    const el = document.createElement('style');
    el.id = id;
    el.textContent = HOSTILE_BUTTON_CSS;
    document.head.append(el);
  };
  const remove = () => document.getElementById(id)?.remove();
  return { inject, remove };
}

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
    const hostStyle = hostStyleTagController('shadow-isolation-hostile-style');

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
