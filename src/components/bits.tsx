import type { Contributor } from '../types';
import { avatarColors } from '../lib/util';

export function Avatar({ c, size, font }: { c: Contributor; size: number; font: number }) {
  const [bg, fg] = avatarColors(c.hue);
  return (
    <div className="avatar" style={{ width: size, height: size, background: bg, color: fg, fontSize: font }} aria-hidden>
      {c.ini}
    </div>
  );
}

export function Toast({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="toast" role="status">
      {text}
    </div>
  );
}

export const MOM_NOTE =
  'From my kitchen to yours, these recipes hold so much more than ingredients. They hold memories, laughter, and a love that never fades. I hope each dish wraps you in warmth and brings you joy for years to come.';
