// Vitest setup file
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { __setShadowIsolationDisabledDefault } from '../lib/shadow-isolation';

// Render SDK components un-isolated in the jsdom unit suite so existing
// light-DOM queries (screen/within/querySelector) keep working. Isolation
// itself is proven in browser-mode *.shadow-isolation.stories.tsx; jsdom can't
// assert computed-style isolation anyway (__YV_STYLES__ is empty there).
// See docs/adr/0005-shadow-dom-style-isolation.md.
__setShadowIsolationDisabledDefault(true);

// Clean up after each test
afterEach(() => {
  cleanup();
});
