import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

declare const __YV_STYLES__: string;

const ShadowRootContext = createContext<ShadowRoot | null>(null);

/**
 * @internal Experimental Shadow DOM style-isolation primitive — spike, not a
 * stable API. See docs/adr/0005-shadow-dom-style-isolation-spike.md.
 */
export function useShadowRoot(): ShadowRoot | null {
  return useContext(ShadowRootContext);
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
 * See docs/adr/0005-shadow-dom-style-isolation-spike.md.
 */
export function ShadowRootHost({ children }: ShadowRootHostProps): React.ReactNode {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [shadowRoot, setShadowRoot] = useState<ShadowRoot | null>(null);
  const [needsStyleTagFallback, setNeedsStyleTagFallback] = useState(false);

  useEffect(() => {
    if (!hostRef.current || shadowRoot) return;

    const root = hostRef.current.attachShadow({ mode: 'open' });
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
