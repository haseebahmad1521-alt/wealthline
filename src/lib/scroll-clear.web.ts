import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';

import { clearGlass, glassVars } from '@/components/glass.web';
import { scene } from '@/lib/scene';

// Owner, Nov 2, 2026: the faster you scroll Rankings, the clearer its glass gets (less tint, less blur), so the
// planet's motion shows through; it frosts back over as you slow down. Presentation only. Off under reduced motion
// or reduced transparency, where the glass stays fully frosted.

/** |velocity| in screens per second where clearing starts and where it's at its clearest. */
const START = 0.6;
const FULL = 4;
const still = () =>
  typeof matchMedia !== 'undefined' &&
  (matchMedia('(prefers-reduced-motion: reduce)').matches || matchMedia('(prefers-reduced-transparency: reduce)').matches);

/** A ref for a wrapper around the glass to thin: its descendants' default glass follows the scroll speed. */
export function useScrollClear() {
  const node = useRef<HTMLElement | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (still()) return;
      const reset = () => Object.values(glassVars).forEach((name) => node.current?.style.removeProperty(name));
      let frame = 0;
      let clarity = 0;
      let shown = 0;
      let t = performance.now();
      const tick = (now: number) => {
        const dt = Math.min((now - t) / 1000, 0.1);
        t = now;
        // scene.velocity eases back to zero in the planet's frame loop once the scroll stops.
        const k = Math.min(Math.max((Math.abs(scene.velocity) - START) / (FULL - START), 0), 1);
        const target = k * k * (3 - 2 * k);
        // Clears quickly as you speed up, frosts back over more gently as you slow.
        clarity += (target - clarity) * (1 - Math.exp(-dt / (target > clarity ? 0.08 : 0.3)));
        // Steps keep the style writes (and the backdrop re-blurs they cost) to real changes.
        const step = Math.round(clarity * 48) / 48;
        if (step !== shown && node.current) {
          shown = step;
          if (step === 0) reset();
          else {
            const g = clearGlass(step);
            node.current.style.setProperty(glassVars.tint, g.tint);
            node.current.style.setProperty(glassVars.backdrop, g.backdrop);
            node.current.style.setProperty(glassVars.webkit, g.webkit);
          }
        }
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
      return () => {
        cancelAnimationFrame(frame);
        reset();
      };
    }, []),
  );
  return useCallback((n: unknown) => void (node.current = n as HTMLElement | null), []);
}
