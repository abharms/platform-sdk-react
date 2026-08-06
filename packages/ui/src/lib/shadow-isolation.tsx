import {
  createContext,
  createElement,
  forwardRef,
  useContext,
  type ComponentType,
  type ForwardRefExoticComponent,
  type FunctionComponent,
  type PropsWithoutRef,
  type RefAttributes,
} from 'react';
import { ShadowRootHost, useShadowRoot } from './shadow-root-host';

/**
 * Test-only escape hatch. Starts `false` so production always isolates;
 * `src/test/setup.ts` and `.storybook/preview.tsx` flip it so the existing
 * behavior suite renders components un-isolated. `@internal`, never exported —
 * see docs/adr/0005-shadow-dom-style-isolation.md.
 */
let defaultIsolationDisabled = false;

/** @internal Test-only. Globally disable/enable default-on isolation. Do NOT export publicly. */
export function __setShadowIsolationDisabledDefault(disabled: boolean): void {
  defaultIsolationDisabled = disabled;
}

/**
 * Per-subtree override of `defaultIsolationDisabled`. `undefined` (the default)
 * defers to the global flag. `true` disables isolation and `false` forces it on.
 * Dedicated `*.shadow-isolation.stories.tsx` provide `false` so they can prove
 * the self-wrap still fires when the environment default disables isolation.
 */
const ShadowIsolationOverrideContext = createContext<boolean | undefined>(undefined);

/** @internal Forces isolation on/off for a subtree. Used by isolation stories/tests. */
export const ShadowIsolationOverrideProvider = ShadowIsolationOverrideContext.Provider;

/**
 * Wraps an implementation component so it isolates itself in a `ShadowRootHost`
 * by default — consumers get a fully isolated component with no wrapper of their
 * own. Idempotent: if an ancestor already established a shadow boundary
 * (`useShadowRoot() !== null`), it renders straight into that one instead of
 * nesting a redundant shadow root. Generalizes the pattern that shipped first on
 * `YouVersionAuthButton`.
 *
 * The ancestor check recognizes SDK-owned shadow roots through React context.
 * A component rendered within a consumer-owned shadow root creates its own SDK
 * shadow root, preserving the SDK's reset and style-injection guarantees.
 *
 * NOTE: `attachShadow` runs only in a client effect, so an isolated component
 * renders empty on first paint and pops in — the SSR/first-paint flash tracked
 * in docs/adr/0005-shadow-dom-style-isolation.md (out of scope here).
 */
export function withShadowIsolation<P extends object, T>(
  Impl: ForwardRefExoticComponent<PropsWithoutRef<P> & RefAttributes<T>>,
  displayName?: string,
): ForwardRefExoticComponent<PropsWithoutRef<P> & RefAttributes<T>>;
export function withShadowIsolation<P extends object>(
  Impl: FunctionComponent<P>,
  displayName?: string,
): FunctionComponent<P>;
export function withShadowIsolation<P extends object>(
  Impl: ComponentType<P>,
  displayName?: string,
): ComponentType<P> {
  const Wrapped = forwardRef(function ShadowIsolated(props, ref) {
    const override = useContext(ShadowIsolationOverrideContext);
    const alreadyIsolated = useShadowRoot() !== null;
    // `createElement` keeps the generic implementation free of JSX/ref typing
    // branches. The public overloads expose a ref only when `Impl` supports one.
    const element = createElement(Impl, { ...(props as P), ref } as unknown as P);
    const isolationDisabled = override ?? defaultIsolationDisabled;
    if (isolationDisabled || alreadyIsolated) return element;
    return createElement(ShadowRootHost, null, element);
  });
  Wrapped.displayName = displayName ?? Impl.displayName ?? Impl.name;
  return Wrapped as unknown as ComponentType<P>;
}
