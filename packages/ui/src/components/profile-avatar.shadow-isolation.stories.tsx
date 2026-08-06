import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProfileAvatar } from './profile-avatar';
import { ShadowIsolationOverrideProvider } from '@/lib/shadow-isolation';
import { assertInheritedStyleIsolation } from '@/test/shadow-isolation-story-utils';

/**
 * Proves default-on Shadow DOM isolation for `ProfileAvatar`: a bare
 * `<ProfileAvatar />` isolates itself, so host-page inherited CSS cannot reach
 * its initials. See docs/adr/0005-shadow-dom-style-isolation.md.
 */
const meta = {
  title: 'Spikes/ProfileAvatar (Shadow DOM)',
  component: ProfileAvatar,
  // Presentational only — no auth provider needed.
  parameters: { includeAuth: false },
} satisfies Meta<typeof ProfileAvatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Isolation: Story = {
  tags: ['integration'],
  render: () => (
    <div style={{ display: 'flex', gap: 24 }}>
      {/* Light-DOM control: the Storybook escape hatch renders this un-isolated. */}
      <ProfileAvatar name="Cam Anderson" data-testid="control-avatar" />
      {/* Force isolation ON to prove the bare component self-wraps. */}
      <ShadowIsolationOverrideProvider value={false}>
        <ProfileAvatar name="Cam Anderson" data-testid="shadow-avatar" />
      </ShadowIsolationOverrideProvider>
    </div>
  ),
  play: ({ canvasElement }) =>
    assertInheritedStyleIsolation(canvasElement, {
      control: '[data-testid="control-avatar"] [data-slot="avatar-fallback"]',
      subject: '[data-testid="shadow-avatar"] [data-slot="avatar-fallback"]',
    }),
};
