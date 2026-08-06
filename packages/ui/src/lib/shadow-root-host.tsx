import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type KeyboardEventHandler,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { createShadowAwareFocusTrap } from './shadow-focus-trap';

declare const __YV_STYLES__: string;

const ShadowRootContext = createContext<ShadowRoot | null>(null);

/**
 * @internal Experimental Shadow DOM style-isolation primitive — spike, not a
 * stable API. See docs/adr/0005-shadow-dom-style-isolation.md.
 */
export function useShadowRoot(): ShadowRoot | null {
  return useContext(ShadowRootContext);
}

/**
 * Couples the two things a shadow-isolated Radix portal always needs together:
 * redirecting the `Portal` into the current shadow root, and installing the
 * shadow-aware focus trap on the portalled `Content`. Bundling them means a new
 * portalled primitive can't wire the container but forget the trap — which
 * would silently re-introduce the focus-leak this feature exists to fix. Both
 * are no-ops outside a `ShadowRootHost` (`container` falls back to
 * `document.body`; the trap early-returns). See shadow-focus-trap.ts.
 *
 * @internal Experimental, alongside `ShadowRootHost`.
 */
export function useShadowPortal<T extends HTMLElement = HTMLElement>(
  contentOnKeyDown?: KeyboardEventHandler<T>,
): {
  portalProps: { container: ShadowRoot | null };
  contentProps: { onKeyDown: KeyboardEventHandler<T> };
} {
  const shadowRoot = useShadowRoot();
  return {
    portalProps: { container: shadowRoot },
    contentProps: { onKeyDown: createShadowAwareFocusTrap<T>(shadowRoot, contentOnKeyDown) },
  };
}

// Built once, lazily, on first attach — never at module import time, so this
// stays side-effect-free on import (see packages/ui/CLAUDE.md). Shared across
// every ShadowRootHost instance so the CSS is parsed once regardless of how
// many shadow-wrapped components exist on a page.
let sdkStyleSheet: CSSStyleSheet | undefined;

function supportsAdoptedStyleSheets(root: ShadowRoot): boolean {
  return (
    typeof CSSStyleSheet !== 'undefined' &&
    typeof CSSStyleSheet.prototype.replaceSync === 'function' &&
    'adoptedStyleSheets' in root
  );
}

function getOrCreateSdkStyleSheet(): CSSStyleSheet {
  if (!sdkStyleSheet) {
    sdkStyleSheet = new CSSStyleSheet();
    sdkStyleSheet.replaceSync(__YV_STYLES__);
  }
  return sdkStyleSheet;
}

export interface ShadowRootHostProps {
  children: ReactNode;
}

/**
 * @internal Experimental. Attaches a real ShadowRoot and renders `children`
 * inside it, injecting the SDK's compiled styles (`__YV_STYLES__`) directly
 * into the shadow root.
 *
 * This is not optional: `<YvStyles />` delivers CSS via a React 19
 * `<style precedence>` element that React hoists into `document.head`, and a
 * ShadowRoot is a separate style-scoping boundary — head styles do not cross
 * into it. Without this, a shadow-wrapped component would render unstyled.
 *
 * Descendants can call `useShadowRoot()` to redirect Radix `Portal`
 * containers into the same shadow tree instead of the default
 * `document.body`.
 *
 * See docs/adr/0005-shadow-dom-style-isolation.md.
 */
export function ShadowRootHost({ children }: ShadowRootHostProps): React.ReactNode {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [shadowRoot, setShadowRoot] = useState<ShadowRoot | null>(null);
  const [needsStyleTagFallback, setNeedsStyleTagFallback] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    // Guard on the DOM (`host.shadowRoot`), NOT the `shadowRoot` state: under
    // React StrictMode the mount effect runs twice against the same committed
    // render (the state closure is still null on the second run), so a
    // state-based guard would call `attachShadow` twice on the same host and
    // throw `NotSupportedError`. Checking the live shadow root is StrictMode-safe.
    if (!host || host.shadowRoot) return;

    const root = host.attachShadow({ mode: 'open' });
    if (supportsAdoptedStyleSheets(root)) {
      root.adoptedStyleSheets = [getOrCreateSdkStyleSheet()];
    } else {
      // jsdom (unit tests) and older browsers have no constructable
      // stylesheets — fall back to a plain <style> tag portaled inside the
      // shadow tree below.
      setNeedsStyleTagFallback(true);
    }
    setShadowRoot(root);
  }, [shadowRoot]);

  return (
    // display:contents so this host div doesn't introduce a block-level
    // wrapper around inline-flex/w-fit SDK components.
    <div ref={hostRef} data-testid="shadow-root-host" style={{ display: 'contents' }}>
      {shadowRoot
        ? createPortal(
            <ShadowRootContext.Provider value={shadowRoot}>
              {needsStyleTagFallback ? <style>{__YV_STYLES__}</style> : null}
              {children}
            </ShadowRootContext.Provider>,
            shadowRoot,
          )
        : null}
    </div>
  );
}
