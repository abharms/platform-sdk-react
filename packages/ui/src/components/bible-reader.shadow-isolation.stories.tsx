import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor } from 'storybook/test';
import { BibleReader } from './bible-reader';
import { ShadowIsolationOverrideProvider } from '@/lib/shadow-isolation';
import { getShadowRoot } from '@/test/shadow-dom-test-utils';
import { assertInheritedStyleIsolation } from '@/test/shadow-isolation-story-utils';

/**
 * Proves default-on Shadow DOM isolation for the compound `BibleReader`, and —
 * uniquely among our components — that its **raw** Radix portal (the
 * verse-action popover) redirects INTO the reader's shadow root rather than
 * escaping to `document.body`. That's the Stage-1 change
 * (`container={useShadowRoot()}` on `verse-action-popover.tsx` / `ui/dialog.tsx`),
 * and this is the only place it's exercised inside a real shadow root.
 * See docs/adr/0005-shadow-dom-style-isolation.md.
 */
const meta = {
  title: 'Spikes/BibleReader (Shadow DOM)',
  component: BibleReader.Root,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof BibleReader.Root>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Isolation: Story = {
  tags: ['integration'],
  render: () => (
    <div style={{ display: 'flex', gap: 24 }}>
      {/* Light-DOM control (un-isolated via the Storybook escape hatch). */}
      <div data-testid="control-text">In the beginning</div>
      {/* Force isolation ON: the whole compound reader shares ONE shadow root,
          and its Content/Toolbar/popovers render inside it. */}
      <ShadowIsolationOverrideProvider value={false}>
        <div style={{ height: 520, width: 380 }}>
          <BibleReader.Root defaultVersionId={111} verseActions="popover" showVerseNumbers>
            <BibleReader.Content />
            <BibleReader.Toolbar />
          </BibleReader.Root>
        </div>
      </ShadowIsolationOverrideProvider>
    </div>
  ),
  play: async ({ canvasElement }) => {
    // Wait for the reader (async passage fetch) to render inside its shadow root.
    const shadowRoot = await getShadowRoot(canvasElement);
    await waitFor(
      () => {
        if (!shadowRoot.querySelector('[data-slot="yv-bible-renderer"]')) {
          throw new Error('reader content not rendered yet');
        }
      },
      { timeout: 8000 },
    );

    // 1. The compound reader isolates itself: hostile inherited host CSS reaches
    //    the light-DOM control but NOT the reader's verse text.
    await assertInheritedStyleIsolation(canvasElement, {
      control: '[data-testid="control-text"]',
      subject: '[data-slot="yv-bible-renderer"]',
    });

    // 2. Stage-1 proof: selecting a verse opens the verse-action popover — a RAW
    //    Radix portal — which must land INSIDE the reader's shadow root, not
    //    document.body.
    const verse = shadowRoot.querySelector<HTMLElement>('.yv-v[v="1"]');
    if (!verse) throw new Error('verse element not found in shadow root');
    await userEvent.click(verse);

    await waitFor(() => {
      void expect(shadowRoot.querySelector('[role="dialog"]')).not.toBeNull();
    });
    // …and it did NOT escape to the light DOM.
    void expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  },
};
