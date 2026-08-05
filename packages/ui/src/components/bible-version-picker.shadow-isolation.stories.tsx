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

// Mirrors the tabbable filter in ui/popover.tsx. A plain selector match is not
// equivalent: it picks up roving-tabindex elements (inactive Radix Tabs
// triggers are `tabindex="-1"`) and elements inside hidden/collapsed subtrees,
// so its "last candidate" can be an element the user can never reach.
function getTabbableCandidates(container: Element): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]'),
  ).filter((element) => {
    if (element.hasAttribute('disabled') || element.hidden) return false;
    if (element.tabIndex < 0) return false;
    if (element.closest('[inert]')) return false;
    return element.checkVisibility({ visibilityProperty: true });
  });
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

// DIAGNOSTIC — reproducing a manually-reported bug, not yet a permanent test.
// Reported: focusing the search input, then Shift+Tab, closes the popover.
// The search input is NOT the first tabbable element (the header's language
// trigger and close button precede it), so this is an ordinary mid-sequence
// Shift+Tab, not the wraparound edge case already covered above.
//
// First attempt at this diagnostic dispatched a synthetic Tab keydown and
// found nothing — because for a non-edge Tab, neither Radix's nor our
// handler intervenes at all, and a synthetic (untrusted) KeyboardEvent
// never triggers the browser's native default action, so focus never
// actually moved. `.focus()` calls, unlike constructed events, dispatch
// genuinely trusted focus/blur/focusin/focusout events — that's what
// DismissableLayer's outside-detection actually listens to, so this
// version simulates the real focus transition directly instead.
export const DiagnosticShiftTabFromSearchInput: Story = {
  tags: ['integration'],
  play: async ({ canvasElement }) => {
    const shadowRoot = await openPicker(canvasElement);

    const dialog = shadowRoot.querySelector('[role="dialog"]');
    if (!dialog) throw new Error('dialog not found');

    let searchInputMaybe: HTMLInputElement | null = null;
    await waitFor(() => {
      searchInputMaybe = shadowRoot.querySelector<HTMLInputElement>('input');
      if (!searchInputMaybe) throw new Error('search input not found');
    });
    if (!searchInputMaybe) throw new Error('search input not found');
    const searchInput: HTMLInputElement = searchInputMaybe;

    const candidates = getTabbableCandidates(dialog);
    const searchIndex = candidates.indexOf(searchInput);
    if (searchIndex < 1) throw new Error('search input has no predecessor to Shift+Tab to');
    const previous = candidates[searchIndex - 1];
    if (!previous) throw new Error('no previous candidate found');

    searchInput.focus();
    await waitFor(() => {
      void expect(shadowRoot.activeElement).toBe(searchInput);
    });

    // Simulate the real focus transition Shift+Tab would produce — a real
    // .focus() call, not a synthetic keydown (see comment above).
    previous.focus();

    await new Promise((resolve) => setTimeout(resolve, 300));

    const dialogAfter = shadowRoot.querySelector('[role="dialog"]');
    const active = shadowRoot.activeElement;
    if (!dialogAfter) {
      throw new Error(
        `dialog closed after focusing the element before the search input. activeElement=${active?.tagName ?? 'null'} ${active?.getAttribute('data-testid') ?? active?.textContent?.slice(0, 20) ?? ''}`,
      );
    }
    void expect(shadowRoot.activeElement).toBe(previous);
  },
};

/**
 * Regression tests using GENUINELY TRUSTED keyboard input.
 *
 * `storybook/test`'s `userEvent` is `@testing-library/user-event`, which
 * computes Tab destinations in JS via `document.querySelectorAll` and so is
 * blind to shadow trees (see the ADR). Vitest browser mode exposes a
 * *different* `userEvent`, backed by Playwright's CDP-level input: real
 * trusted key events that exercise the browser's own native tab-order
 * computation. That is the only way these behaviors can be tested for real.
 * Imported dynamically so this module still loads in the Storybook dev UI,
 * which is not browser mode.
 */
async function pressTab({ shift = false } = {}): Promise<void> {
  const { userEvent: trustedUserEvent } = await import('vitest/browser');
  await trustedUserEvent.keyboard(shift ? '{Shift>}{Tab}{/Shift}' : '{Tab}');
  await waitFor(() => {
    void expect(true).toBe(true);
  });
}

/**
 * Originally reported as "Shift+Tab out of the search input closes the
 * popover". Root cause was NOT Shadow DOM: the search input carried
 * `tabIndex={1}`, and a positive tabindex jumps an element to the front of its
 * tab-order scope regardless of DOM position — so Shift+Tab from it was a
 * backwards exit off the front edge, not the mid-sequence move it appeared to
 * be. Inside a shadow tree that exit lands on one of Radix's
 * `useFocusGuards` spans in `document.body`, which fires `focusin`, which
 * DismissableLayer correctly reads as "focus left" and dismisses.
 */
export const ShiftTabFromSearchInputKeepsPopoverOpen: Story = {
  tags: ['integration'],
  play: async ({ canvasElement }) => {
    const shadowRoot = await openPicker(canvasElement);

    const dialog = shadowRoot.querySelector('[role="dialog"]');
    if (!dialog) throw new Error('dialog not found');

    let searchInput: HTMLInputElement | null = null;
    await waitFor(() => {
      searchInput = shadowRoot.querySelector<HTMLInputElement>('input');
      if (!searchInput) throw new Error('search input not found');
    });
    if (!searchInput) throw new Error('search input not found');

    // Guards the actual root cause directly: any positive tabindex here
    // silently reintroduces the bug, and would otherwise only show up as a
    // confusing dismiss much later.
    void expect((searchInput as HTMLInputElement).tabIndex).toBe(0);

    const candidates = getTabbableCandidates(dialog);
    const searchIndex = candidates.indexOf(searchInput);
    void expect(searchIndex).toBeGreaterThan(0);

    (searchInput as HTMLInputElement).focus();
    await waitFor(() => {
      void expect(shadowRoot.activeElement).toBe(searchInput);
    });

    await pressTab({ shift: true });

    // The popover must survive an ordinary backwards tab.
    void expect(shadowRoot.querySelector('[role="dialog"]')).not.toBeNull();
    // ...and focus must stay inside it, rather than escaping to the light DOM.
    void expect(dialog.contains(shadowRoot.activeElement)).toBe(true);
  },
};

/**
 * The genuine edge case the custom `onKeyDown` in `ui/popover.tsx` exists to
 * handle, exercised with real trusted input rather than a synthetic keydown.
 * A synthetic `KeyboardEvent` never triggers the browser's native default
 * action, so it cannot distinguish "our handler wrapped focus" from "native
 * tab order happened to do the right thing" — this can.
 *
 * Also covers the tightened tabbable-candidate filter: the last element in
 * plain DOM order is not necessarily the last *tabbable* one (Radix Tabs
 * triggers carry `tabindex="-1"` when inactive, and collapsed panels hide
 * their contents), and mis-identifying it means the real edge goes undetected
 * — which under Shadow DOM closes the popover rather than merely leaking focus.
 */
export const TrustedTabAtLastCandidateStaysInsidePopover: Story = {
  tags: ['integration'],
  play: async ({ canvasElement }) => {
    const shadowRoot = await openPicker(canvasElement);

    const dialog = shadowRoot.querySelector('[role="dialog"]');
    if (!dialog) throw new Error('dialog not found');

    const candidates = getTabbableCandidates(dialog);
    const last = candidates[candidates.length - 1];
    if (!last) throw new Error('no tabbable candidates found');

    last.focus();
    await waitFor(() => {
      void expect(shadowRoot.activeElement).toBe(last);
    });

    await pressTab();

    void expect(shadowRoot.querySelector('[role="dialog"]')).not.toBeNull();
    void expect(dialog.contains(shadowRoot.activeElement)).toBe(true);
  },
};

/**
 * `BibleVersionPicker.Content` keeps BOTH the version panel and the language
 * panel mounted so the crossfade between them can animate, hiding the
 * inactive one with `opacity-0` / `pointer-events-none` / `blur` / `scale`.
 *
 * None of those remove an element from sequential focus navigation. Before
 * `inert` was added, Tab walked out of the version search input straight into
 * the invisible language panel — roughly ten focusable elements the user
 * cannot see — so focus appeared to vanish and never looped.
 *
 * This asserts the tab order contains only the visible panel, which is also
 * what makes the search input the genuine last element, and therefore what
 * makes the wraparound in `ui/popover.tsx` fire where a user expects it to.
 */
export const HiddenLanguagePanelIsNotInTabOrder: Story = {
  tags: ['integration'],
  play: async ({ canvasElement }) => {
    const shadowRoot = await openPicker(canvasElement);
    const dialog = shadowRoot.querySelector('[role="dialog"]');
    if (!dialog) throw new Error('dialog not found');

    await waitFor(() => {
      void expect(shadowRoot.querySelector('input')).not.toBeNull();
    });

    const tabbable = getTabbableCandidates(dialog);
    // The language panel renders a language list; none of it may be tabbable
    // while it is the hidden panel.
    const languageNames = /english|french|français|korean|한국어|spanish|español|portuguese/i;
    const reachableLanguageEntries = tabbable.filter(
      (element) =>
        element.tagName === 'BUTTON' &&
        languageNames.test(element.textContent ?? '') &&
        element.closest('[data-slot="popover-content"]') !== null &&
        // The header's language trigger is legitimately tabbable; it shows the
        // current language and opens the panel.
        !/^english\d/i.test((element.textContent ?? '').trim()),
    );
    void expect(reachableLanguageEntries).toHaveLength(0);
  },
};

/**
 * The user-visible consequence of the above: Tab from the search input — the
 * last element of the visible panel — wraps to the first, rather than
 * disappearing into the hidden panel.
 */
export const TabFromSearchInputWrapsToFirstElement: Story = {
  tags: ['integration'],
  play: async ({ canvasElement }) => {
    const shadowRoot = await openPicker(canvasElement);
    const dialog = shadowRoot.querySelector('[role="dialog"]');
    if (!dialog) throw new Error('dialog not found');

    let searchInput: HTMLInputElement | null = null;
    await waitFor(() => {
      searchInput = shadowRoot.querySelector<HTMLInputElement>('input');
      if (!searchInput) throw new Error('search input not found');
    });
    if (!searchInput) throw new Error('search input not found');

    const candidates = getTabbableCandidates(dialog);
    const first = candidates[0];
    if (!first) throw new Error('no tabbable candidates');
    // The search input renders visually at the bottom of the panel and must
    // genuinely be last in the tab order for the wraparound to be correct.
    void expect(candidates[candidates.length - 1]).toBe(searchInput);

    (searchInput as HTMLInputElement).focus();
    await waitFor(() => {
      void expect(shadowRoot.activeElement).toBe(searchInput);
    });

    await pressTab();

    void expect(shadowRoot.querySelector('[role="dialog"]')).not.toBeNull();
    void expect(shadowRoot.activeElement).toBe(first);
  },
};
