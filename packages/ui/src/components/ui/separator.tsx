import * as React from 'react';
import * as SeparatorPrimitive from '@radix-ui/react-separator';

import { cn } from '@/lib/utils';
import { withShadowIsolation } from '@/lib/shadow-isolation';

function SeparatorImpl({
  className,
  orientation = 'horizontal',
  decorative = true,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>): React.ReactNode {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      className={cn(
        'yv:bg-border yv:shrink-0 yv:data-[orientation=horizontal]:h-px yv:data-[orientation=horizontal]:w-full yv:data-[orientation=vertical]:h-full yv:data-[orientation=vertical]:w-px',
        className,
      )}
      {...props}
    />
  );
}

// Wrapped so a standalone `<Separator />` self-isolates like every other public
// export. Idempotent: rendered inside an already-isolated SDK component (its
// normal home) it passes through without nesting a shadow root.
const Separator = withShadowIsolation(SeparatorImpl, 'Separator');

export { Separator };
