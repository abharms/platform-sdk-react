import { useState } from 'react';
import { useTheme } from '@/components/use-theme';
import {
  YouVersionAuthButton,
  VerseOfTheDay,
  BibleCard,
  BibleVersionPicker,
  BibleChapterPicker,
  BibleTextView,
  ProfileAvatar,
  BibleReader,
  FootnoteContent,
  Separator,
  Textarea,
} from '@youversion/platform-react-ui';

/**
 * Manual production test for Shadow DOM style isolation.
 *
 * This page consumes the BUILT @youversion/platform-react-ui package exactly as
 * an external consumer would — so isolation is default-ON here (no Storybook
 * test override exists in this app). Each hostile vector below is an
 * independent, aggressive, `!important`, unlayered global stylesheet — toggle
 * them one at a time and watch which (if any) reaches the SDK components.
 *
 * The light-DOM controls on the left are the positive control: they MUST get
 * clobbered, proving each stylesheet is actually potent. Every SDK component on
 * the right must render identically with the vector on or off.
 */

type Vector = { key: string; label: string; note: string; css: string };

const VECTORS: Vector[] = [
  {
    key: 'type-selectors',
    label: 'Type-selector attack',
    note: 'button / input {} — tests the shadow boundary blocks selector matching.',
    css: `
button, input, [role="button"] {
  font-family: 'Comic Sans MS', 'Chalkboard SE', cursive !important;
  background: #b91c1c !important;
  color: #ffffff !important;
  border: 3px solid #000000 !important;
  border-radius: 0 !important;
  text-transform: uppercase !important;
  letter-spacing: 0.08em !important;
  padding: 12px 18px !important;
}`,
  },
  {
    key: 'inherited',
    label: 'Inherited-property attack',
    note: 'body {} inherited props (incl. font-family/size/line-height) — tests the authoritative inner-wrapper reset.',
    css: `
body {
  letter-spacing: 0.3em !important;
  text-transform: uppercase !important;
  font-style: italic !important;
  color: #d600d6 !important;
  font-family: 'Comic Sans MS', 'Chalkboard SE', cursive !important;
  font-size: 22px !important;
  line-height: 2.4 !important;
  cursor: crosshair !important;
}`,
  },
  {
    key: 'universal-important',
    label: 'Universal !important (host-targeting)',
    note: '* {} matches the shadow HOST element itself, where outer !important outranks the non-important :host reset.',
    css: `
* {
  color: #d600d6 !important;
  font-family: 'Comic Sans MS', 'Chalkboard SE', cursive !important;
  letter-spacing: 0.25em !important;
  text-transform: uppercase !important;
}`,
  },
  {
    key: 'shadow-host-box',
    label: 'Shadow-host box attack',
    note: 'Targets the light-DOM shadow host with display / opacity / pointer-events / transform — tests that host CSS cannot hide or disable the entire SDK component.',
    css: `
[data-testid='shadow-root-host'], [data-host-box-witness] {
  display: none !important;
  opacity: 0 !important;
  pointer-events: none !important;
  transform: scale(0.5) !important;
}`,
  },
  {
    key: 'custom-props',
    label: 'CSS custom-property attack',
    note: 'Overrides bare --spacing, which the SDK consumes and resets inside the shadow tree. --radius is included only for the light-DOM witness; SDK radius variables are namespaced.',
    css: `
:root, * {
  --spacing: 12px !important;
  --radius: 36px !important;
}`,
  },
  {
    key: 'sdk-tokens',
    label: 'SDK design-token attack',
    note: 'Overrides --yv-* Tailwind tokens on the shadow host — tests that the build-generated inner-wrapper token copy wins inside the shadow tree.',
    css: `
:root, * {
  --yv-spacing: 48px !important;
  --yv-radius-2xl: 0px !important;
  --yv-container-sm: 100rem !important;
  --yv-text-base: 40px !important;
}`,
  },
  {
    key: 'font-face',
    label: '@font-face hijack',
    note: "Redefines 'Inter' / 'Untitled Serif' / 'Source Serif 4' to a system novelty font. Font faces are document-scoped and apply INSIDE shadow roots — isolation can’t block this.",
    css: `
@font-face {
  font-family: 'Inter';
  src: local('Chalkboard SE'), local('Comic Sans MS');
}
@font-face {
  font-family: 'Untitled Serif';
  src: local('Chalkboard SE'), local('Comic Sans MS');
}
@font-face {
  font-family: 'Source Serif 4';
  src: local('Chalkboard SE'), local('Comic Sans MS');
}`,
  },
];

export function HostileCssPage() {
  // The two original vectors default on; the remaining ones default off so each
  // can be observed in isolation.
  const [enabled, setEnabled] = useState<Record<string, boolean>>({
    'type-selectors': true,
    inherited: true,
    'universal-important': false,
    'shadow-host-box': false,
    'custom-props': false,
    'sdk-tokens': false,
    'font-face': false,
  });
  const [versionId, setVersionId] = useState(111);
  const [book, setBook] = useState('JHN');
  const [chapter, setChapter] = useState('1');

  // SDK components are isolated from host CSS, so they don't inherit the app's
  // dark mode — each takes an explicit light/dark prop. Resolve the app theme
  // (including `system`) and pass it through so the demo follows dark mode.
  const { theme } = useTheme();
  const sdkTheme: 'light' | 'dark' =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
      ? 'dark'
      : 'light';

  const toggle = (key: string) => setEnabled((e) => ({ ...e, [key]: !e[key] }));

  return (
    <div className="flex flex-col grow gap-8 w-full p-6 md:p-12">
      {/* A <style> anywhere in the document applies globally to the light DOM,
          but by spec cannot cross a shadow boundary — which is the whole test.
          @font-face is the exception: font faces are document-scoped. */}
      {VECTORS.filter((v) => enabled[v.key]).map((v) => (
        <style key={v.key}>{v.css}</style>
      ))}

      <div className="flex flex-col gap-3 rounded-lg border p-4">
        <h1 className="text-xl font-semibold">Hostile CSS isolation test</h1>
        <p className="text-sm text-muted-foreground max-w-3xl">
          <strong>Built, production</strong> SDK components (isolation on by default). Enable each
          hostile vector and watch: the light-DOM controls (left) must get clobbered; the SDK
          components (right) must not change at all.
        </p>
        <fieldset className="flex flex-col gap-2">
          {VECTORS.map((v) => (
            <label key={v.key} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={enabled[v.key] ?? false}
                onChange={() => toggle(v.key)}
                className="mt-1"
              />
              <span>
                <span className="font-medium">{v.label}</span>
                <span className="text-muted-foreground"> — {v.note}</span>
              </span>
            </label>
          ))}
        </fieldset>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        {/* LEFT: light-DOM controls — SHOULD be clobbered by whatever is enabled. */}
        <section className="flex flex-col gap-4 rounded-lg border border-dashed p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Light DOM (should get clobbered)
          </h2>
          <button type="button">Plain host-app button</button>
          <p>Plain host-app paragraph text — inherited props should hit this.</p>
          <p style={{ fontFamily: 'Inter, sans-serif' }}>
            Paragraph requesting <code>Inter</code> — the @font-face hijack should change this.
          </p>
          <p style={{ fontFamily: "'Source Serif 4', serif" }}>
            Paragraph requesting <code>Source Serif 4</code> — the @font-face hijack should change
            this.
          </p>
          <div data-host-box-witness>
            Light-DOM host-box witness — this disappears when that attack is enabled.
          </div>
          {/* Direct witness for the custom-property attack: consumes --spacing
              (padding) and --radius (corners), so it visibly balloons when that
              vector is on, while the SDK components next door stay put. */}
          <div
            style={{
              padding: 'var(--spacing)',
              borderRadius: 'var(--radius)',
              border: '2px solid currentColor',
            }}
          >
            Light-DOM witness — padding <code>var(--spacing)</code>, corners{' '}
            <code>var(--radius)</code>. The custom-property attack balloons this.
          </div>
          <div
            style={{
              padding: 'var(--yv-spacing)',
              borderRadius: 'var(--yv-radius-2xl)',
              fontSize: 'var(--yv-text-base)',
              border: '2px solid currentColor',
            }}
          >
            Light-DOM SDK-token witness — padding <code>var(--yv-spacing)</code>, corners{' '}
            <code>var(--yv-radius-2xl)</code>, type <code>var(--yv-text-base)</code>.
          </div>
        </section>

        {/* RIGHT: real SDK components — SHOULD resist. */}
        <section className="flex flex-col gap-6 rounded-lg border p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            SDK components (should resist)
          </h2>

          <YouVersionAuthButton
            size="short"
            background={sdkTheme}
            onAuthError={(err) => console.error('Auth error:', err)}
          />

          <BibleVersionPicker.Root
            versionId={versionId}
            onVersionChange={setVersionId}
            background={sdkTheme}
          >
            <BibleVersionPicker.Trigger />
            <BibleVersionPicker.Content />
          </BibleVersionPicker.Root>

          <BibleChapterPicker.Root
            versionId={3034}
            book={book}
            onBookChange={setBook}
            chapter={chapter}
            onChapterChange={setChapter}
            background={sdkTheme}
          >
            <BibleChapterPicker.Trigger />
          </BibleChapterPicker.Root>

          <ProfileAvatar name="Jane Doe" theme={sdkTheme} />

          <BibleTextView reference="JHN.3.16" versionId={3034} theme={sdkTheme} />

          <VerseOfTheDay size="default" versionId={3034} background={sdkTheme} />

          <BibleCard
            reference="JHN.3.16"
            versionId={3034}
            showVersionPicker
            background={sdkTheme}
          />

          {/* BibleReader — also the natural home of VerseActionPopover: select a
              verse inside the reader to surface it (under the hostile toggles). */}
          <div className="h-96 w-full overflow-hidden rounded-lg border">
            <BibleReader.Root
              defaultBook="JHN"
              defaultChapter="1"
              defaultVersionId={3034}
              background={sdkTheme}
            >
              <BibleReader.Content />
              <BibleReader.Toolbar />
            </BibleReader.Root>
          </div>

          {/* The remaining public exports — smaller standalone pieces, also
              isolated. FootnoteContent is pure/presentational; Separator and
              Textarea are primitives that now self-isolate too. */}
          <FootnoteContent
            verseNum="16"
            notes={['A representative footnote body.']}
            verseHtml="For God so loved the world"
            reference="JHN.3"
            theme={sdkTheme}
          />

          <Separator />

          <Textarea defaultValue="Editable SDK textarea." />
        </section>
      </div>
    </div>
  );
}
