import { StrictMode } from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ShadowRootHost } from './shadow-root-host';

describe('ShadowRootHost', () => {
  // Regression: StrictMode double-invokes the mount effect against the same
  // committed render. A guard on the `shadowRoot` *state* (still null on the
  // second run) would call `attachShadow` twice on the same host and throw
  // `NotSupportedError`. The effect must guard on the live `host.shadowRoot`.
  it('attaches exactly one shadow root under StrictMode without throwing', () => {
    expect(() =>
      render(
        <StrictMode>
          <ShadowRootHost>
            <span data-testid="child">hi</span>
          </ShadowRootHost>
        </StrictMode>,
      ),
    ).not.toThrow();

    const host = document.querySelector<HTMLDivElement>('[data-testid="shadow-root-host"]');
    expect(host).not.toBeNull();
    expect(host?.shadowRoot).not.toBeNull();
  });
});
