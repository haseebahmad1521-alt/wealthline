import { useEffect, useState } from 'react';

/**
 * Phones: how far the visible area's bottom (above the keyboard) sits above the app's own bottom edge, for fields that
 * ride above the keyboard (search, chat). Measured against the app root's box rather than window.innerHeight: iOS
 * Safari can make the two differ (toolbar, viewport-fit=cover). The document itself must never scroll (index.html),
 * but iOS scrolls it anyway to reveal a focused field near the bottom; that moved the app up on top of our own lift,
 * so the scroll is undone and the inset alone places the field.
 */
export function useKeyboardInset(active: boolean) {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!active || !vv) return setInset(0);
    const root = document.getElementById('root') ?? document.documentElement;
    const update = () => {
      if (window.scrollY || document.documentElement.scrollTop || document.body.scrollTop) {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      }
      setInset(Math.max(0, Math.round(root.getBoundingClientRect().bottom - (vv.offsetTop + vv.height))));
    };
    // iOS reports the keyboard while it is still animating; settle again once it has landed.
    const timers: ReturnType<typeof setTimeout>[] = [];
    const settle = () => {
      update();
      timers.push(setTimeout(update, 120), setTimeout(update, 360), setTimeout(update, 700));
    };
    settle();
    vv.addEventListener('resize', settle);
    vv.addEventListener('scroll', update);
    window.addEventListener('scroll', update);
    document.addEventListener('focusin', settle);
    return () => {
      timers.forEach(clearTimeout);
      vv.removeEventListener('resize', settle);
      vv.removeEventListener('scroll', update);
      window.removeEventListener('scroll', update);
      document.removeEventListener('focusin', settle);
    };
  }, [active]);
  return inset;
}
