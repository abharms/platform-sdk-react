![License](https://img.shields.io/badge/license-Apache%202.0-blue)

# @youversion/platform-react-ui

Pre-built React components for Bible applications with styling included.

## When to use this package

Use `@youversion/platform-react-ui` when you need:
- ✅ Production-ready Bible components for your React app
- ✅ Pre-styled components with light/dark mode
- ✅ Minimal setup: wrap your app with providers and use the components
- ✅ Consistent, accessible UI out of the box
Get your App Key at [platform.youversion.com](https://platform.youversion.com/)

**Use other packages instead if you:**
- ❌ Need low-level API access → Use [@youversion/platform-core](../core/README.md)
- ❌ Want custom UI → Use [@youversion/platform-react-hooks](../hooks/README.md)

## Install

```bash
pnpm add @youversion/platform-react-ui
```

Get your App Key at [platform.youversion.com](https://platform.youversion.com/)

## Usage

Wrap your app with the provider and use components:

```tsx
import { YouVersionProvider, BibleTextView } from '@youversion/platform-react-ui';

function App() {
  return (
    <YouVersionProvider appKey={"YOUR_APP_KEY"}>
      <BibleTextView reference="JHN.1.1-4" versionId={3034} />
    </YouVersionProvider>
  );
}
```

## Styling

All component CSS is automatically injected when you wrap your app with `YouVersionProvider` — no extra imports or build steps needed. Under the hood, it uses React 19's [`<style precedence>`](https://react.dev/reference/react-dom/components/style) to hoist styles into `<head>` with built-in deduplication and SSR/Suspense support.

### Shadow DOM isolation

Visual components render inside open Shadow DOM roots by default. Host-page selectors —
including Tailwind preflight, global element rules such as `button {}`, and broad
`!important` declarations — cannot select or restyle component internals. You do not
need to remove or weaken your application's global CSS.

This also means global selectors are not a supported customization mechanism. Use each
component's documented props and `YouVersionProvider` theme options. If you need full
control over markup and styling, use `@youversion/platform-react-hooks` to build your own
UI on the headless data layer.

Shadow roots change DOM inspection and testing behavior. Browser automation should use
shadow-aware locators; Playwright locators pierce open shadow roots by default. With DOM
Testing Library, query from the component host's `shadowRoot` rather than from
`document.body`.

Overlays are rendered inside the component's shadow tree to preserve style isolation.
An ancestor with `overflow: hidden`, a restrictive stacking context, or similar layout
constraints can clip or layer a popover/dialog beneath host content. Place overlay-based
components in a container that allows their content to extend beyond its bounds.

Shadow roots attach on the client after mount. Server-rendered isolated components have
an empty host until hydration completes, and a forwarded DOM ref becomes available on a
subsequent commit rather than during the consumer's first mount effect.

**Non-React or manual CSS import:**

```tsx
import '@youversion/platform-react-ui/styles.css';
```

All component classes are prefixed with `yv:` to avoid class-name collisions inside the
SDK stylesheet.

### Content Security Policy

The SDK loads webfonts from external origins. If your app sets a strict `Content-Security-Policy`, allowlist these hosts so fonts aren't blocked (without them, components fall back to a system sans-serif):

```
font-src  https://fonts.gstatic.com https://cdn.youversion.com;
style-src https://fonts.googleapis.com https://api.youversion.com;
```

- `fonts.googleapis.com` / `fonts.gstatic.com` — Inter and Source Serif 4 (base typography), loaded from Google Fonts
- `api.youversion.com` — the Fonts API stylesheet (`/v1/fonts/1/stylesheet`), which `YouVersionProvider` requests with your app key
- `cdn.youversion.com` — the Untitled Serif woff2 files that stylesheet points at

Untitled Serif is YouVersion's brand serif and the SDK's default serif face. There is no prop to turn it off. If these hosts are blocked, serif text falls back to Source Serif 4 with no layout break — the stack is `'Untitled Serif', 'Source Serif 4', serif`. If you load Untitled Serif yourself, your copy is used; the stack names it first regardless of who fetched it.

Font-face names are document-scoped rather than shadow-scoped. If a host application
registers a different face under `Inter`, `Untitled Serif`, or `Source Serif 4`, SDK text
requesting that public family name can use the host's face. This is the one known
host-style collision that Shadow DOM cannot prevent.

## Theming

Set the theme via the `YouVersionProvider`'s `theme` prop. Defaults to `'light'`.

```tsx
import { YouVersionProvider, BibleTextView } from '@youversion/platform-react-ui';

function App() {
  return (
    <YouVersionProvider appKey="YOUR_APP_KEY" theme="dark">
      <BibleTextView reference="JHN.1.1-4" versionId={3034} />
    </YouVersionProvider>
  );
}
```

### Theme options

| Value | Behavior |
|-------|----------|
| `'light'` | Light mode (default) |
| `'dark'` | Dark mode |
| `'system'` | Follows the user's OS preference via `prefers-color-scheme` |

### Following OS theme

Pass `theme="system"` to automatically match the user's OS setting:

```tsx
<YouVersionProvider appKey="YOUR_APP_KEY" theme="system">
  {/* Components switch between light/dark based on OS preference */}
</YouVersionProvider>
```

### Toggling theme manually

```tsx
import { useState } from 'react';
import { YouVersionProvider, BibleTextView } from '@youversion/platform-react-ui';

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  return (
    <YouVersionProvider appKey="YOUR_APP_KEY" theme={theme}>
      <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
        Toggle theme
      </button>
      <BibleTextView reference="JHN.1.1-4" versionId={3034} />
    </YouVersionProvider>
  );
}
```

### Per-component overrides

Individual components accept a `background` prop to override the provider theme locally:

```tsx
<YouVersionProvider appKey="YOUR_APP_KEY" theme="light">
  {/* This component uses dark styling despite the provider being light */}
  <BibleReader.Root background="dark" versionId={3034}>
    <BibleReader.Content />
  </BibleReader.Root>
</YouVersionProvider>
```

### Customization

Use documented component props and provider theme options for supported customization.
Host-page CSS variables and selectors do not cross the component's shadow boundary. For
custom markup or styling beyond those APIs, use `@youversion/platform-react-hooks`.

## Documentation and API Reference
* [developers.youversion.com/sdks/react](https://developers.youversion.com/sdks/react)

## License

This SDK is licensed under [Apache 2.0](./LICENSE). 

Licensing information for the Bible versions is available 
at the [YouVersion Platform](https://platform.youversion.com/) site.
