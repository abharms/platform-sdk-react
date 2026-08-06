import { useState, type ReactElement } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import * as SDK from '@/index';
import { ShadowIsolationOverrideProvider } from '@/lib/shadow-isolation';
import { assertComponentIsolated } from '@/test/shadow-isolation-story-utils';

/**
 * All-exports Shadow DOM isolation regression harness.
 *
 * Two guarantees, together, make the "styling is locked down across the board"
 * claim durable rather than point-in-time:
 *
 *  1. COVERAGE (`EveryExportIsClassified`): every runtime export of the package
 *     must be listed in either `ISOLATION_REGISTRY` (a rendered component proven
 *     to resist hostile CSS) or `EXEMPT` (with a reason). Adding a new export
 *     without classifying it fails the test — you cannot silently ship an
 *     un-isolated component.
 *  2. ISOLATION (one story per registry entry): each registered component is
 *     rendered isolated, and the full hostile barrage
 *     (`HOSTILE_ALL_VECTORS_CSS`, every vector except the documented `@font-face`
 *     leak) is fired at it. Every probed computed style on every element in its
 *     shadow tree must be identical with the barrage on or off.
 *
 * See docs/adr/0005-shadow-dom-style-isolation.md.
 */

// --- Fixtures for components that need controlled state / a bounded box --------

function VersionPickerFixture(): ReactElement {
  const [versionId, setVersionId] = useState(111);
  return (
    <SDK.BibleVersionPicker.Root
      versionId={versionId}
      onVersionChange={setVersionId}
      background="light"
    >
      <SDK.BibleVersionPicker.Trigger />
      <SDK.BibleVersionPicker.Content />
    </SDK.BibleVersionPicker.Root>
  );
}

function ChapterPickerFixture(): ReactElement {
  const [book, setBook] = useState('JHN');
  const [chapter, setChapter] = useState('1');
  return (
    <SDK.BibleChapterPicker.Root
      versionId={3034}
      book={book}
      onBookChange={setBook}
      chapter={chapter}
      onChapterChange={setChapter}
      background="light"
    >
      <SDK.BibleChapterPicker.Trigger />
    </SDK.BibleChapterPicker.Root>
  );
}

function BibleReaderFixture(): ReactElement {
  return (
    <div style={{ height: 400 }}>
      <SDK.BibleReader.Root defaultBook="JHN" defaultChapter="1" defaultVersionId={3034}>
        <SDK.BibleReader.Content />
        <SDK.BibleReader.Toolbar />
      </SDK.BibleReader.Root>
    </div>
  );
}

// --- The registry: every standalone-mountable visual component ----------------

const ISOLATION_REGISTRY: Record<string, () => ReactElement> = {
  YouVersionAuthButton: () => (
    <SDK.YouVersionAuthButton size="short" onAuthError={() => undefined} />
  ),
  VerseOfTheDay: () => <SDK.VerseOfTheDay versionId={3034} />,
  BibleCard: () => <SDK.BibleCard reference="JHN.3.16" versionId={3034} showVersionPicker />,
  BibleTextView: () => <SDK.BibleTextView reference="JHN.3.16" versionId={3034} />,
  ProfileAvatar: () => <SDK.ProfileAvatar name="Jane Doe" />,
  BibleVersionPicker: () => <VersionPickerFixture />,
  BibleChapterPicker: () => <ChapterPickerFixture />,
  BibleReader: () => <BibleReaderFixture />,
  FootnoteContent: () => (
    <SDK.FootnoteContent
      verseNum="16"
      notes={['A representative footnote body.']}
      verseHtml="For God so loved the world"
      reference="JHN.3"
    />
  ),
  Separator: () => <SDK.Separator />,
  Textarea: () => <SDK.Textarea />,
};

/**
 * Exports that are NOT independently-mountable visual components. Each must have
 * a reason; the coverage test forces this list to stay honest.
 */
const EXEMPT = new Set<string>([
  // Core clients / API (non-visual, re-exported from platform-core)
  'ApiClient',
  'BibleClient',
  'LanguagesClient',
  'HighlightsClient',
  'DataExchangeClient',
  'OrganizationsClient',
  'YouVersionAPI',
  'YouVersionAPIUsers',
  // Storage strategies
  'MemoryStorageStrategy',
  'SessionStorageStrategy',
  // Providers / isolation primitive / hooks (not styled components themselves)
  'BaseYouVersionProvider',
  'YouVersionProvider',
  'ShadowRootHost',
  'useShadowRoot',
  'useYVAuth',
  // Utility functions
  'transformBibleHtml',
  'getAdjacentChapter',
  'clampBibleReaderFontSize',
  'nextBibleReaderFontSizeUp',
  'nextBibleReaderFontSizeDown',
  'createBibleThemeSettingsContentHandlers',
  'buildDataExchangeUrl',
  'handleDataExchangeCallback',
  'parseDataExchangeCallback',
  'parseGrantedPermissions',
  'buildSdkVersionHeaderValue',
  'getHttpStatus',
  // Constants / config / value-typed exports
  'BIBLE_READER_FONT',
  'BOOK_CANON',
  'BOOK_IDS',
  'CANON_IDS',
  'DEFAULT_LICENSE_FREE_BIBLE_VERSION',
  'HIGHLIGHT_COLORS',
  'SDK_NAME',
  'SDK_VERSION',
  'SDK_VERSION_HEADER_NAME',
  'SignInWithYouVersionPermission',
  'SignInWithYouVersionResult',
  'YouVersionPlatformConfiguration',
  'YouVersionUserInfo',
  // Test-only reset helpers
  '__resetAuthCallbackDedupeForTests',
  '__resetTokenRefreshDedupeForTests',
  // Already self-isolating (withShadowIsolation), but not independently mountable
  // for a standalone pixel proof: each throws without its parent Root context, so
  // it is exercised inside its parent's shadow root.
  'BibleThemeSettingsContent', // wrapped; throws without BibleReader.Root
  'VerseActionPopover', // wrapped; driven by BibleReader verse selection
  // NOT wrapped, and provably no standalone isolation surface: both call
  // useBibleVersionPickerContext(), which THROWS without BibleVersionPicker.Root,
  // so they cannot be rendered standalone at all (verified, bible-version-picker.tsx).
  'BibleLanguagePickerContent',
  'BibleVersionPickerLanguageTrigger',
]);

const meta = {
  title: 'Spikes/All Exports (Shadow DOM Isolation)',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * COVERAGE GUARD. Fails if any runtime export is neither a registered isolation
 * subject nor explicitly exempt — so a new component can't ship without proving
 * its isolation (or a deliberate exemption).
 */
export const EveryExportIsClassified: Story = {
  tags: ['integration'],
  parameters: { includeAuth: false },
  render: () => <span data-testid="coverage-guard">coverage guard</span>,
  play: () => {
    const registered = new Set(Object.keys(ISOLATION_REGISTRY));
    const unclassified = Object.keys(SDK).filter(
      (name) => !registered.has(name) && !EXEMPT.has(name),
    );
    void expect(
      unclassified,
      `Unclassified export(s): ${unclassified.join(', ')}. Add each to ISOLATION_REGISTRY ` +
        `(with a rendered isolation proof) or to EXEMPT (with a reason) in ` +
        `all-exports.shadow-isolation.stories.tsx.`,
    ).toEqual([]);

    // Keep the registry honest too: every registered/exempt name must still exist.
    const known = new Set(Object.keys(SDK));
    const stale = [...registered, ...EXEMPT].filter((name) => !known.has(name));
    void expect(stale, `Stale entr(ies) no longer exported: ${stale.join(', ')}`).toEqual([]);
  },
};

// --- One isolation proof per registered component -----------------------------
//
// Each story is a literal (not factory-created) so its `tags`/`parameters` are
// statically visible to Storybook's indexer — factory-returned stories hide their
// tags and get filtered out of the `integration` run. The render/play bodies are
// shared via the two helpers below.

// ShadowIsolationOverrideProvider value={false} forces the component to
// self-isolate even though Storybook disables isolation by default.
const isolated = (name: string): ReactElement => (
  <ShadowIsolationOverrideProvider value={false}>
    {ISOLATION_REGISTRY[name]?.()}
  </ShadowIsolationOverrideProvider>
);

const isolationPlay =
  (name: string) =>
  ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> =>
    assertComponentIsolated(canvasElement, { styleId: `all-exports-${name}` });

// The auth button needs the auth provider; the rest opt out (avoids the
// auth-redirect env requirement).
const noAuth = { includeAuth: false } as const;

export const AuthButton: Story = {
  tags: ['integration'],
  render: () => isolated('YouVersionAuthButton'),
  play: isolationPlay('YouVersionAuthButton'),
};

export const VerseOfTheDay: Story = {
  tags: ['integration'],
  parameters: noAuth,
  render: () => isolated('VerseOfTheDay'),
  play: isolationPlay('VerseOfTheDay'),
};

export const BibleCard: Story = {
  tags: ['integration'],
  parameters: noAuth,
  render: () => isolated('BibleCard'),
  play: isolationPlay('BibleCard'),
};

export const BibleTextView: Story = {
  tags: ['integration'],
  parameters: noAuth,
  render: () => isolated('BibleTextView'),
  play: isolationPlay('BibleTextView'),
};

export const ProfileAvatar: Story = {
  tags: ['integration'],
  parameters: noAuth,
  render: () => isolated('ProfileAvatar'),
  play: isolationPlay('ProfileAvatar'),
};

export const BibleVersionPicker: Story = {
  tags: ['integration'],
  parameters: noAuth,
  render: () => isolated('BibleVersionPicker'),
  play: isolationPlay('BibleVersionPicker'),
};

export const BibleChapterPicker: Story = {
  tags: ['integration'],
  parameters: noAuth,
  render: () => isolated('BibleChapterPicker'),
  play: isolationPlay('BibleChapterPicker'),
};

export const BibleReader: Story = {
  tags: ['integration'],
  parameters: noAuth,
  render: () => isolated('BibleReader'),
  play: isolationPlay('BibleReader'),
};

export const FootnoteContent: Story = {
  tags: ['integration'],
  parameters: noAuth,
  render: () => isolated('FootnoteContent'),
  play: isolationPlay('FootnoteContent'),
};

export const Separator: Story = {
  tags: ['integration'],
  parameters: noAuth,
  render: () => isolated('Separator'),
  play: isolationPlay('Separator'),
};

export const Textarea: Story = {
  tags: ['integration'],
  parameters: noAuth,
  render: () => isolated('Textarea'),
  play: isolationPlay('Textarea'),
};
