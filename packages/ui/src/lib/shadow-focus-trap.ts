import { type KeyboardEvent, type KeyboardEventHandler } from 'react';

// Anything that *might* be tabbable; `isTabbable` below does the real filtering.
export const FOCUSABLE_SELECTOR = 'a[href], button, input, select, textarea, [tabindex]';

/**
 * Mirrors the semantics of `@radix-ui/react-focus-scope`'s own
 * `getTabbableCandidates`: an element is tabbable only if it is enabled, not
 * hidden, and has a non-negative tabindex.
 *
 * A plain `querySelectorAll('button, input, ...')` is NOT equivalent, and the
 * difference is load-bearing here — see `createShadowAwareFocusTrap`. It matches
 * roving-tabindex elements (Radix Tabs triggers carry `tabindex="-1"` when
 * inactive) and elements inside collapsed/hidden subtrees, either of which can
 * make the "last candidate" an element the user can never actually reach — so
 * the real last element's Tab goes undetected.
 */
export function isTabbable(element: HTMLElement): boolean {
  if (element.hasAttribute('disabled') || element.hidden) return false;
  if (element.tabIndex < 0) return false;
  // `inert` removes a whole subtree from sequential focus navigation, but is
  // invisible to both `tabIndex` and `checkVisibility` — an inert element still
  // reports `tabIndex === 0` and still has layout boxes.
  if (element.closest('[inert]')) return false;
  // Catches display:none/visibility:hidden anywhere up the subtree (e.g. an
  // inactive Radix TabsContent panel, which carries the `hidden` attribute on
  // the panel itself rather than on its descendants).
  if (typeof element.checkVisibility === 'function') {
    return element.checkVisibility({ visibilityProperty: true });
  }
  return element.getClientRects().length > 0;
}

/**
 * Returns an `onKeyDown` handler that works around an upstream
 * `@radix-ui/react-focus-scope` bug: inside a shadow root its Tab-wraparound
 * compares against `document.activeElement`, which resolves to the shadow HOST,
 * not the real focused descendant — so its comparison never matches, the
 * wraparound `preventDefault()` never fires, and Tab past the last focusable
 * element leaks focus out of the dialog/popover instead of looping. This redoes
 * the edge detection using `shadowRoot.activeElement` and moves focus itself.
 *
 * It runs before Radix's own (still-broken, now-harmless) handler — Radix's
 * `Slot`/`asChild` composition calls the innermost prop first — and composes
 * with any `onKeyDown` the caller already passes (invoked first, so a caller's
 * `preventDefault()` wins). It is a no-op outside a shadow root, so non-shadow
 * usage is unaffected.
 *
 * Shared by `ui/popover.tsx`, `ui/dialog.tsx`, and `verse-action-popover.tsx`.
 * See docs/adr/0005-shadow-dom-style-isolation.md.
 */
export function createShadowAwareFocusTrap<T extends HTMLElement = HTMLElement>(
  shadowRoot: ShadowRoot | null,
  userOnKeyDown?: KeyboardEventHandler<T>,
): KeyboardEventHandler<T> {
  return (event: KeyboardEvent<T>) => {
    userOnKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (!shadowRoot) return;
    if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return;

    // DOM order is only the same as tab order when nothing inside carries a
    // positive tabindex — a positive value moves an element to the front of its
    // tab-order scope regardless of where it sits in the tree, which would make
    // `first`/`last` below wrong. The SDK deliberately uses none; see the note
    // in docs/adr/0005-shadow-dom-style-isolation.md.
    const candidates = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ).filter(isTabbable);
    if (candidates.length === 0) return;

    const first = candidates[0];
    const last = candidates[candidates.length - 1];
    const focused = shadowRoot.activeElement;

    if (!event.shiftKey && focused === last) {
      event.preventDefault();
      first?.focus();
    } else if (event.shiftKey && focused === first) {
      event.preventDefault();
      last?.focus();
    }
  };
}
