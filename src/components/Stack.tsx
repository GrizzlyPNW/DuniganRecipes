import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * iOS-style page layers.
 * - kind "push": slides in from the right, slides back out on close, swipe from the left edge to go back.
 * - kind "modal": slides up from the bottom (cook mode).
 * - kind "fade": cross-fades (lightbox, drawers).
 * A layer keeps showing its last content while it animates out, so closing looks like iOS "pop".
 */
type Kind = 'push' | 'modal' | 'fade';
const EXIT_MS = 340;

export function Layer({
  show,
  kind = 'push',
  covered = false,
  z,
  onBack,
  children,
}: {
  show: boolean;
  kind?: Kind;
  /** Another page is pushed on top: shift left and dim, like iOS. */
  covered?: boolean;
  z: number;
  /** Enables swipe-from-the-left-edge to go back (push layers). */
  onBack?: () => void;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(show);
  const [phase, setPhase] = useState<'enter' | 'idle' | 'exit'>(show ? 'enter' : 'idle');
  const last = useRef<ReactNode>(children);
  if (show) last.current = children;
  const el = useRef<HTMLDivElement>(null);
  const swiped = useRef(false);

  useEffect(() => {
    if (show) {
      swiped.current = false;
      setMounted(true);
      setPhase('enter');
      return;
    }
    if (!mounted) return;
    if (swiped.current) {
      setMounted(false);
      return;
    }
    setPhase('exit');
    const t = setTimeout(() => setMounted(false), EXIT_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  // Swipe back from the left edge.
  const drag = useRef<{ x: number; y: number; dx: number; t: number; active: boolean } | null>(null);
  function onPointerDown(e: React.PointerEvent) {
    if (kind !== 'push' || !onBack || e.pointerType === 'mouse' || covered) return;
    if (e.clientX - (el.current?.getBoundingClientRect().left || 0) > 28) return;
    drag.current = { x: e.clientX, y: e.clientY, dx: 0, t: performance.now(), active: false };
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || !el.current) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.active) {
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
        drag.current = null; // a scroll, not a swipe
        return;
      }
      if (dx < 8) return;
      d.active = true;
      el.current.setPointerCapture(e.pointerId);
    }
    d.dx = Math.max(0, dx);
    el.current.style.transition = 'none';
    el.current.style.transform = `translateX(${d.dx}px)`;
  }
  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    if (!d?.active || !el.current) return;
    const width = el.current.offsetWidth;
    const speed = d.dx / Math.max(1, performance.now() - d.t);
    const node = el.current;
    node.style.transition = 'transform 0.22s cubic-bezier(.2,.8,.2,1)';
    if (d.dx > width * 0.35 || speed > 0.6) {
      node.style.transform = 'translateX(100%)';
      swiped.current = true;
      setTimeout(() => onBack?.(), 200);
    } else {
      node.style.transform = '';
      setTimeout(() => (node.style.transition = ''), 240);
    }
  }

  if (!mounted) return null;
  return (
    <div
      ref={el}
      className={`layer layer-${kind} ${phase}${covered ? ' covered' : ''}`}
      style={{ zIndex: z }}
      onAnimationEnd={(e) => e.target === el.current && phase === 'enter' && setPhase('idle')}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {last.current}
    </div>
  );
}

/** Renders sheets and pop-ups over the whole app, outside any scrolling page. */
export function AppPortal({ children }: { children: ReactNode }) {
  const target = typeof document !== 'undefined' ? document.querySelector('.app') : null;
  return target ? createPortal(children, target) : null;
}

/* ---------- Header actions shared by every page ---------- */

export interface Nav {
  openMenu: () => void;
  openProfile: () => void;
}
export const NavContext = createContext<Nav>({ openMenu: () => {}, openProfile: () => {} });
export const useNav = () => useContext(NavContext);
