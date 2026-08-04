import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, expect, waitFor } from 'storybook/test';
import { BibleVersionPicker, type RootProps } from './bible-version-picker';
import { ShadowRootHost } from '@/lib/shadow-root-host';
import { getShadowRoot } from '@/test/shadow-dom-test-utils';

/**
 * Real-component follow-up to the deleted bespoke Radix Popover spike.
 * `BibleVersionPicker` renders through `ui/popover.tsx`, which now redirects
 * its Radix `Portal` container to `useShadowRoot()` when rendered inside a
 * `ShadowRootHost`. This proves both Radix's dismiss behavior AND the
 * component's actual version-selection logic still work once genuinely
 * inside a shadow tree — not just a simplified stand-in primitive.
 *
 * See docs/adr/0005-shadow-dom-style-isolation-spike.md.
 */

function ShadowPickerWrapper({ versionId: initialVersionId = 111, ...props }: RootProps) {
  const [versionId, setVersionId] = useState(initialVersionId);
  return (
    <div>
      <ShadowRootHost>
        <BibleVersionPicker.Root versionId={versionId} onVersionChange={setVersionId} {...props}>
          <BibleVersionPicker.Trigger />
          <BibleVersionPicker.Content />
        </BibleVersionPicker.Root>
      </ShadowRootHost>
      <button data-testid="outside-marker" type="button">
        Outside marker (light DOM, not in the shadow tree)
      </button>
    </div>
  );
}

const meta = {
  title: 'Spikes/BibleVersionPicker (Shadow DOM)',
  component: ShadowPickerWrapper,
  tags: ['autodocs'],
  args: {
    versionId: 111,
  },
} satisfies Meta<typeof ShadowPickerWrapper>;

export default meta;

type Story = StoryObj<typeof meta>;

function findButtonByText(shadowRoot: ShadowRoot, pattern: RegExp): HTMLButtonElement | null {
  return (
    Array.from(shadowRoot.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
      pattern.test(button.textContent ?? ''),
    ) ?? null
  );
}

async function openPicker(canvasElement: HTMLElement): Promise<ShadowRoot> {
  const shadowRoot = await getShadowRoot(canvasElement);

  let trigger: HTMLButtonElement | null = null;
  await waitFor(() => {
    trigger = findButtonByText(shadowRoot, /niv/i);
    if (!trigger) throw new Error('trigger not found in shadow root');
  });
  if (!trigger) throw new Error('trigger not found in shadow root');

  await userEvent.click(trigger);

  await waitFor(() => {
    const dialog = shadowRoot.querySelector('[role="dialog"]');
    void expect(dialog).not.toBeNull();
  });

  return shadowRoot;
}

export const InsideClickShouldNotClose: Story = {
  tags: ['integration'],
  play: async ({ canvasElement }) => {
    const shadowRoot = await openPicker(canvasElement);

    // The heading is real content rendered by ui/popover.tsx inside the
    // portaled dialog — not a dismiss control.
    const heading = shadowRoot.querySelector('h2');
    if (!heading) throw new Error('heading not found in shadow root');

    await userEvent.click(heading);

    await waitFor(() => {
      const dialog = shadowRoot.querySelector('[role="dialog"]');
      void expect(dialog).not.toBeNull();
    });
  },
};

export const GenuineOutsideClickShouldClose: Story = {
  tags: ['integration'],
  play: async ({ canvasElement }) => {
    const shadowRoot = await openPicker(canvasElement);

    const outsideMarker = canvasElement.querySelector<HTMLButtonElement>(
      '[data-testid="outside-marker"]',
    );
    if (!outsideMarker) throw new Error('outside marker not found');

    await userEvent.click(outsideMarker);

    await waitFor(() => {
      const dialog = shadowRoot.querySelector('[role="dialog"]');
      void expect(dialog).toBeNull();
    });
  },
};

export const SelectingAVersionUpdatesTheTrigger: Story = {
  tags: ['integration'],
  play: async ({ canvasElement }) => {
    const shadowRoot = await openPicker(canvasElement);

    let ampItem: HTMLElement | null = null;
    await waitFor(() => {
      ampItem =
        Array.from(shadowRoot.querySelectorAll<HTMLElement>('[role="listitem"]')).find((el) =>
          /amplified/i.test(el.textContent ?? ''),
        ) ?? null;
      if (!ampItem) throw new Error('Amplified Bible list item not found');
    });
    if (!ampItem) throw new Error('Amplified Bible list item not found');

    await userEvent.click(ampItem);

    // Selecting closes the popover via the component's own onRequestClose
    // logic (not Radix's dismissable-layer) and updates the trigger — this
    // is the actual application logic working across the shadow boundary,
    // not just Radix's open/close mechanics.
    await waitFor(() => {
      const dialog = shadowRoot.querySelector('[role="dialog"]');
      void expect(dialog).toBeNull();
    });
    await waitFor(() => {
      const trigger = findButtonByText(shadowRoot, /amp/i);
      void expect(trigger).not.toBeNull();
    });
  },
};

/**
 * Focus-trap and ARIA verification — ADR-0005 Next Steps #1.
 *
 * Two separate, independently-confirmed findings here, not one:
 *
 * 1. A real bug in Radix: `@radix-ui/react-focus-scope`'s `handleKeyDown`
 *    decides whether to wrap focus at the first/last tabbable element by
 *    comparing `document.activeElement` against the candidates it found.
 *    Inside a shadow tree, `document.activeElement` resolves to the shadow
 *    *host*, not the real focused descendant, so the comparison never
 *    matches and the wrap-around `preventDefault()` never fires. Fixed in
 *    `ui/popover.tsx` via a shadow-aware `onKeyDown` that runs first (Radix's
 *    `asChild`/`Slot` composition calls the innermost prop first) and uses
 *    `shadowRoot.activeElement` instead.
 * 2. A *separate* blind spot in the test tooling itself:
 *    `@testing-library/user-event`'s `getTabDestination` (which both
 *    `userEvent.tab()` and plain `userEvent.keyboard('{Tab}')` route
 *    through — `.tab()` is a thin wrapper over `.keyboard('{Tab}')`) finds
 *    candidates via `document.querySelectorAll(...)`, which also can't see
 *    into a shadow root. It can never find the real active element among
 *    its candidates either, and always falls back to focusing
 *    `document.body` — regardless of whether Radix's trap is fixed or not.
 *    An earlier version of this test used `userEvent.tab()`/`.keyboard()`
 *    directly and "confirmed" the escape; that result was confounded by
 *    this tooling limitation, not solely evidence of the Radix bug. These
 *    tests instead place focus at the known edge element directly, then
 *    dispatch only the raw keydown event — bypassing `userEvent`'s own
 *    (broken, for shadow content) Tab-destination computation entirely,
 *    while still exercising the real `onKeyDown` handler chain exactly as a
 *    real keypress would (proven reliable already by the existing
 *    Escape-key tests, which dispatch the same way).
 */

function getTabbableCandidates(container: Element): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    ),
  );
}

function dispatchTabKeydown(target: HTMLElement, { shift = false } = {}): void {
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Tab', shiftKey: shift, bubbles: true, cancelable: true }),
  );
}

export const FocusMovesIntoContentOnOpen: Story = {
  tags: ['integration'],
  play: async ({ canvasElement }) => {
    const shadowRoot = await openPicker(canvasElement);

    const dialog = shadowRoot.querySelector('[role="dialog"]');
    if (!dialog) throw new Error('dialog not found');

    await waitFor(() => {
      void expect(dialog.contains(shadowRoot.activeElement)).toBe(true);
    });
  },
};

export const TabWrapsFromLastToFirst: Story = {
  tags: ['integration'],
  play: async ({ canvasElement }) => {
    const shadowRoot = await openPicker(canvasElement);

    const dialog = shadowRoot.querySelector('[role="dialog"]');
    if (!dialog) throw new Error('dialog not found');

    const candidates = getTabbableCandidates(dialog);
    if (candidates.length < 2) throw new Error('need at least 2 tabbable candidates to test wrap');
    const [first, last] = [candidates[0], candidates[candidates.length - 1]];
    if (!first || !last) throw new Error('missing first/last candidate');

    last.focus();
    await waitFor(() => {
      void expect(shadowRoot.activeElement).toBe(last);
    });

    dispatchTabKeydown(last);

    await waitFor(() => {
      void expect(shadowRoot.activeElement).toBe(first);
    });
  },
};

export const ShiftTabWrapsFromFirstToLast: Story = {
  tags: ['integration'],
  play: async ({ canvasElement }) => {
    const shadowRoot = await openPicker(canvasElement);

    const dialog = shadowRoot.querySelector('[role="dialog"]');
    if (!dialog) throw new Error('dialog not found');

    const candidates = getTabbableCandidates(dialog);
    if (candidates.length < 2) throw new Error('need at least 2 tabbable candidates to test wrap');
    const [first, last] = [candidates[0], candidates[candidates.length - 1]];
    if (!first || !last) throw new Error('missing first/last candidate');

    first.focus();
    await waitFor(() => {
      void expect(shadowRoot.activeElement).toBe(first);
    });

    dispatchTabKeydown(first, { shift: true });

    await waitFor(() => {
      void expect(shadowRoot.activeElement).toBe(last);
    });
  },
};

export const FocusReturnsToTriggerOnClose: Story = {
  tags: ['integration'],
  play: async ({ canvasElement }) => {
    const shadowRoot = await openPicker(canvasElement);

    const trigger = findButtonByText(shadowRoot, /niv/i);
    if (!trigger) throw new Error('trigger not found in shadow root');

    await userEvent.keyboard('{Escape}');

    await waitFor(() => {
      void expect(shadowRoot.querySelector('[role="dialog"]')).toBeNull();
    });
    await waitFor(() => {
      void expect(shadowRoot.activeElement).toBe(trigger);
    });
  },
};

export const AriaControlsResolvesWithinTheSameShadowRoot: Story = {
  tags: ['integration'],
  play: async ({ canvasElement }) => {
    const shadowRoot = await openPicker(canvasElement);

    const trigger = findButtonByText(shadowRoot, /niv/i);
    if (!trigger) throw new Error('trigger not found in shadow root');

    void expect(trigger.getAttribute('aria-expanded')).toBe('true');

    const controlsId = trigger.getAttribute('aria-controls');
    if (!controlsId) throw new Error('trigger has no aria-controls attribute');

    // Trigger and dialog are both portaled into the SAME shadow root (the
    // Portal's container is this shadow root, not document.body), so an
    // id-reference between them is a same-tree reference, not a cross-root
    // one — this confirms that relationship is actually intact, not just
    // assumed from reading the ARIA-and-shadow-DOM caveat in the abstract.
    const referenced = shadowRoot.getElementById(controlsId);
    void expect(referenced).not.toBeNull();
    void expect(referenced?.getAttribute('role')).toBe('dialog');
  },
};
