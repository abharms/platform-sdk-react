// React SDK main entry point

export * from './components';
export * from './types';

// Re-export shared types and API classes
export {
  SignInWithYouVersionPermission,
  SignInWithYouVersionResult,
  YouVersionAPIUsers,

  // Authentication
  type ApiConfig,
  type AuthenticationState,

  // Highlights (the shape of BibleReader.Root's controlled `highlights` prop)
  type Highlight,
} from '@youversion/platform-core';

export {
  YouVersionProvider as BaseYouVersionProvider,
  useYVAuth,
  type UseYVAuthReturn,
} from '@youversion/platform-react-hooks';

export { YouVersionProvider } from './components/YouVersionProvider';

/**
 * @internal Experimental Shadow DOM style-isolation primitive — spike, not a
 * stable API. See docs/adr/0005-shadow-dom-style-isolation.md.
 */
export { ShadowRootHost, useShadowRoot } from './lib/shadow-root-host';
