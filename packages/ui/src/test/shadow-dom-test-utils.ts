import { waitFor } from 'storybook/test';

/**
 * Resolves the `ShadowRoot` attached by a `<ShadowRootHost data-testid="shadow-root-host">`
 * rendered somewhere inside `canvasElement`. Testing Library queries don't
 * pierce shadow boundaries, so tests that need to assert on shadow-tree
 * content must reach in via `shadowRoot.querySelector` directly instead of
 * `within(canvasElement)`.
 */
export async function getShadowRoot(canvasElement: HTMLElement): Promise<ShadowRoot> {
  let shadowRoot: ShadowRoot | null = null;
  await waitFor(() => {
    const host = canvasElement.querySelector<HTMLDivElement>('[data-testid="shadow-root-host"]');
    if (!host?.shadowRoot) throw new Error('shadow host not attached');
    shadowRoot = host.shadowRoot;
  });
  if (!shadowRoot) throw new Error('shadow host not attached');
  return shadowRoot;
}
