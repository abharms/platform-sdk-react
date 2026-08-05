import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { Button } from './button';
import { XIcon } from '../icons/x';
import { useShadowRoot } from '@/lib/shadow-root-host';

import { cn } from '@/lib/utils';

// Anything that *might* be tabbable; `isTabbable` below does the real filtering.
const FOCUSABLE_SELECTOR = 'a[href], button, input, select, textarea, [tabindex]';

/**
 * Mirrors the semantics of `@radix-ui/react-focus-scope`'s own
 * `getTabbableCandidates`: an element is tabbable only if it is enabled, not
 * hidden, and has a non-negative tabindex.
 *
 * A plain `querySelectorAll('button, input, ...')` is NOT equivalent, and the
 * difference is load-bearing here — see `handleShadowAwareFocusTrap`. It
 * matches roving-tabindex elements (Radix Tabs triggers carry
 * `tabindex="-1"` when inactive) and elements inside collapsed/hidden
 * subtrees, either of which can make the "last candidate" an element the user
 * can never actually reach — so the real last element's Tab goes undetected.
 */
function isTabbable(element: HTMLElement): boolean {
  if (element.hasAttribute('disabled') || element.hidden) return false;
  if (element.tabIndex < 0) return false;
  // `inert` removes a whole subtree from sequential focus navigation, but is
  // invisible to both `tabIndex` and `checkVisibility` — an inert element
  // still reports `tabIndex === 0` and still has layout boxes.
  if (element.closest('[inert]')) return false;
  // Catches display:none/visibility:hidden anywhere up the subtree (e.g. an
  // inactive Radix TabsContent panel, which carries the `hidden` attribute on
  // the panel itself rather than on its descendants).
  if (typeof element.checkVisibility === 'function') {
    return element.checkVisibility({ visibilityProperty: true });
  }
  return element.getClientRects().length > 0;
}

function Popover({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>): React.ReactNode {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>): React.ReactNode {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverContent({
  className,
  children,
  headerLeading,
  headerChild,
  align = 'center',
  heading,
  showHeader = true,
  sideOffset = 4,
  theme = 'light',
  onKeyDown,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content> & {
  showHeader?: boolean;
  heading?: React.ReactNode;
  headerLeading?: React.ReactNode;
  headerChild?: React.ReactNode;
  theme?: 'light' | 'dark';
}): React.ReactNode {
  const { t } = useTranslation(undefined, { i18n });
  // Ambient, not a prop: when this renders inside a `ShadowRootHost`, redirect
  // the Portal into that shadow root instead of the default `document.body`
  // so the popover content is genuinely isolated too, not just the trigger.
  // `useShadowRoot()` returns `null` outside a `ShadowRootHost`, and Radix's
  // Portal falls back to `document.body` for a falsy `container` — so this is
  // a no-op for every existing (non-shadow) usage.
  const shadowRoot = useShadowRoot();

  // Workaround for an upstream @radix-ui/react-focus-scope bug: inside a shadow
  // root its Tab-wraparound compares against `document.activeElement`, which
  // resolves to the shadow HOST, so focus leaks out instead of looping. We redo
  // the edge detection with `shadowRoot.activeElement`. Runs before Radix's own
  // (still-broken, now-harmless) handler; no-op outside a shadow root.
  // See docs/adr/0005-shadow-dom-style-isolation-spike.md.
  const handleShadowAwareFocusTrap = (event: React.KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (!shadowRoot) return;
    if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return;

    // DOM order is only the same as tab order when nothing inside carries a
    // positive tabindex — a positive value moves an element to the front of
    // its tab-order scope regardless of where it sits in the tree, which would
    // make `first`/`last` below wrong. The SDK deliberately uses none; see the
    // note in docs/adr/0005-shadow-dom-style-isolation-spike.md.
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

  return (
    <PopoverPrimitive.Portal container={shadowRoot}>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        data-yv-sdk
        data-yv-theme={theme}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={16}
        className={cn(
          'yv:bg-popover yv:text-popover-foreground yv:data-[state=open]:animate-in yv:data-[state=closed]:animate-out yv:data-[state=closed]:fade-out-0 yv:data-[state=open]:fade-in-0 yv:data-[state=closed]:zoom-out-95 yv:data-[state=open]:zoom-in-95 yv:data-[side=bottom]:slide-in-from-top-2 yv:data-[side=left]:slide-in-from-right-2 yv:data-[side=right]:slide-in-from-left-2 yv:data-[side=top]:slide-in-from-bottom-2 yv:z-50 yv:origin-(--radix-popover-content-transform-origin) yv:outline-hidden yv:grid yv:grid-rows-[auto_1fr_auto] yv:p-0 yv:h-full yv:max-h-[66svh] yv:max-sm:max-w-[calc(100vw-2rem)] yv:w-sm yv:sm:max-w-sm yv:overflow-hidden yv:rounded-2xl yv:border-0 yv:shadow-lg',
          className,
        )}
        onKeyDown={handleShadowAwareFocusTrap}
        {...props}
      >
        {showHeader ? (
          <section
            className={cn([
              'yv:bg-muted yv:py-3 yv:rounded-t-2xl yv:px-4 yv:border-b yv:border-border yv:grid yv:grid-cols-[1fr_auto] yv:justify-between yv:items-center yv:gap-2',
              headerChild ? 'yv:grid-cols-[1fr_auto_auto]' : '',
              headerLeading ? 'yv:grid-cols-[auto_1fr_auto]' : '',
              headerLeading && headerChild ? 'yv:grid-cols-[auto_1fr_auto_auto]' : '',
            ])}
          >
            {headerLeading}
            <h2 className="yv:font-bold yv:text-base">{heading}</h2>
            {headerChild}
            <PopoverClose asChild>
              <Button
                variant="ghost"
                size="icon"
                className="yv:w-6 yv:h-6 yv:text-muted-foreground"
              >
                <XIcon className="yv:size-5" />
                <span className="yv:sr-only">{t('closeAriaLabel')}</span>
              </Button>
            </PopoverClose>
          </section>
        ) : null}
        {children}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}

function PopoverClose({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Close>): React.ReactNode {
  return <PopoverPrimitive.Close data-slot="popover-close" {...props} />;
}

export { Popover, PopoverTrigger, PopoverContent, PopoverClose };
