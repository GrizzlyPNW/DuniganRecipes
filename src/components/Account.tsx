import { useEffect, useState } from 'react';
import type { Contributor, Family } from '../lib/store';
import { signInWithGoogle, signOut } from '../lib/auth';
import { useMe, type Me } from '../lib/session';
import { initials, likelyMatches, makeContributor, plural } from '../lib/util';
import { Avatar } from './bits';
import { go } from '../lib/router';
import { useNav } from './Stack';

/* ---------- Header ---------- */

/**
 * The top bar on every page. Root pages show the menu button on the left;
 * pushed pages show an iOS back chevron in the same spot.
 */
export function Header({ onBack, backLabel }: { onBack?: () => void; backLabel?: string }) {
  const me = useMe();
  const nav = useNav();
  return (
    <header className="app-header">
      {onBack ? (
        <button className="hdr-back" onClick={onBack} aria-label={'Back to ' + (backLabel || 'previous page')}>
          <svg width="12" height="20" viewBox="0 0 12 20" aria-hidden>
            <path d="M10 2 2 10l8 8" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {backLabel && <span>{backLabel}</span>}
        </button>
      ) : (
        <button className="hdr-btn" onClick={nav.openMenu} aria-label="Menu">
          <span className="burger">
            <i />
            <i />
            <i />
          </span>
        </button>
      )}
      <picture className="hdr-logo">
        <source srcSet="/logo-header.webp" type="image/webp" />
        <img src="/logo-header.png" alt="The Dunigan Recipes" />
      </picture>
      <button className="hdr-btn hdr-right" onClick={nav.openProfile} aria-label={me ? 'Your profile' : 'Sign in'}>
        <ProfileIcon me={me} size={36} />
      </button>
    </header>
  );
}

export function ProfileIcon({ me, size }: { me: Me | null; size: number }) {
  const [broken, setBroken] = useState(false);
  if (me?.image && !broken) {
    return <img className="pf-img" src={me.image} alt="" width={size} height={size} referrerPolicy="no-referrer" onError={() => setBroken(true)} />;
  }
  if (me) {
    return (
      <span className="pf-ini" style={{ width: size, height: size, fontSize: size * 0.38 }}>
        {initials(me.name || me.email)}
      </span>
    );
  }
  return (
    <svg className="pf-anon" width={size} height={size} viewBox="0 0 36 36" aria-hidden>
      <circle cx="18" cy="18" r="17.25" fill="#fffdf8" stroke="rgba(43,37,33,.18)" strokeWidth="1.5" />
      <circle cx="18" cy="14.5" r="5.5" fill="none" stroke="#2b2521" strokeWidth="1.8" />
      <path d="M8.5 28.5c1.8-4.6 5.3-6.9 9.5-6.9s7.7 2.3 9.5 6.9" fill="none" stroke="#2b2521" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/* ---------- Profile panel ---------- */

export function ProfilePanel({ fam, close, toast }: { fam: Family; close: () => void; toast: (t: string) => void }) {
  const me = useMe();
  return (
    <>
      <div className="scrim" onClick={close} />
      <div className="drawer drawer-right" role="dialog" aria-label="Profile">
        <div className="row-between" style={{ alignItems: 'center' }}>
          <span className="eyebrow">{me ? 'Your profile' : 'Sign in'}</span>
          <button className="x" onClick={close} aria-label="Close profile">
            ✕
          </button>
        </div>

        {fam.mode === 'local' ? (
          <p className="lead" style={{ marginTop: 18 }}>
            The family database isn’t connected here, so everything is saved on this device only.
          </p>
        ) : me ? (
          <>
            <div className="pf-card">
              <ProfileIcon me={me} size={64} />
              <div style={{ minWidth: 0 }}>
                <div className="pf-name">{me.name}</div>
                <div className="pf-email">{me.email}</div>
              </div>
            </div>
            {fam.access === 'member' && <div className="pf-status">✓ You’re in the family box. Stories you add are shared with everyone.</div>}
            {fam.access === 'member' && fam.admin && (
              <button
                className="btn btn-dark btn-block"
                style={{ marginTop: 12 }}
                onClick={() => {
                  close();
                  go('admin');
                }}
              >
                Manage family (admin)
              </button>
            )}
            {fam.access === 'member' && fam.admin && (
              <button
                className="btn btn-outline btn-block"
                style={{ marginTop: 8 }}
                onClick={() => {
                  close();
                  go('invite-family');
                }}
              >
                Invite family
              </button>
            )}
            {fam.access === 'not-member' && <CodeBox fam={fam} toast={toast} />}
            <button
              className="btn btn-outline btn-block"
              style={{ marginTop: 'auto' }}
              onClick={async () => {
                await signOut();
                close();
                toast('Signed out');
              }}
            >
              Sign out
            </button>
          </>
        ) : (
          <>
            <p className="lead" style={{ marginTop: 18 }}>
              Sign in to read and share family stories, add recipe cards, and type up recipes.
            </p>
            <GoogleButton />
            <p className="field-help" style={{ marginTop: 14 }}>
              Recipes and card photos are open to everyone with the link. Stories are just for the family.
            </p>
          </>
        )}
      </div>
    </>
  );
}

/* ---------- Sign-in pieces ---------- */

export function GoogleButton({ label = 'Sign in with Google' }: { label?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn btn-block google-btn"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await signInWithGoogle();
        } finally {
          setBusy(false);
        }
      }}
    >
      <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
        <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
      </svg>
      {busy ? 'Opening Google…' : label}
    </button>
  );
}

function CodeBox({ fam, toast }: { fam: Family; toast: (t: string) => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!code.trim()) return toast('Type the family code first');
    setBusy(true);
    const ok = await fam.join(code).catch(() => false);
    setBusy(false);
    toast(ok ? 'Welcome to the family box' : 'That code didn’t match');
  }
  return (
    <div className="join-box">
      <div className="t">One more step</div>
      <p className="field-help" style={{ margin: '4px 0 12px' }}>
        Open the invite link someone in the family sent you, or type the code from your invite text. You only do this once.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="field"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Your code"
          aria-label="Your invite code or the family code"
          autoCapitalize="off"
          autoCorrect="off"
        />
        <button className="btn btn-accent" onClick={submit} disabled={busy}>
          {busy ? '…' : 'Join'}
        </button>
      </div>
    </div>
  );
}

/** Shown where stories or editing would be, for people who can't use them yet. */
export function AccessGate({ fam, toast, what }: { fam: Family; toast: (t: string) => void; what: string }) {
  if (fam.access === 'not-member') return <CodeBox fam={fam} toast={toast} />;
  return (
    <div className="join-box">
      <div className="t">Sign in to {what}</div>
      <p className="field-help" style={{ margin: '4px 0 12px' }}>
        Family stories and editing are just for the family. Sign in with your Google account to join in.
      </p>
      <GoogleButton />
    </div>
  );
}

/* ---------- Login screen ---------- */

/** The front door: shown until someone is signed in and part of the family. */
export function LoginScreen({ fam, toast }: { fam: Family; toast: (t: string) => void }) {
  const me = useMe();
  const joining = fam.access === 'not-member' && !!me;
  return (
    <div className="login-screen">
      <div className="login-inner">
        <picture>
          <source srcSet="/logo.webp" type="image/webp" />
          <img className="login-logo" src="/logo.png" alt="The Dunigan Recipes" />
        </picture>
        <p className="login-quote">“From my kitchen to yours, these recipes hold so much more than ingredients.”</p>

        {fam.inviteError && <div className="pf-status" style={{ marginBottom: 14, width: '100%' }}>{fam.inviteError}</div>}
        {joining ? (
          <>
            <div className="login-hello">
              <ProfileIcon me={me} size={40} />
              <span>
                Hi, {me!.name.split(' ')[0]}! <button className="link-btn" onClick={() => signOut()}>Not you?</button>
              </span>
            </div>
            {fam.blocked ? (
              <div className="join-box">
                <div className="t">Your access was removed</div>
                <p className="field-help" style={{ margin: '4px 0 0' }}>
                  If you think that’s a mistake, ask Luke (the family admin) to restore you.
                </p>
              </div>
            ) : (
              <CodeBox fam={fam} toast={toast} />
            )}
          </>
        ) : (
          <div className="login-actions">
            <GoogleButton label="Continue with Google" />
            <p className="field-help" style={{ textAlign: 'center', marginTop: 12 }}>
              The family recipe box is just for the family. Sign in with your Google account, then use the invite link or
              family code the first time.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Who are you? (first visit after joining) ---------- */

/**
 * New members give their first and last name. If someone close is already on the family
 * list, we ask "Are you this person?" so their recipes land under their name.
 */
export function WhoAreYou({ fam, toast }: { fam: Family; toast: (t: string) => void }) {
  const me = useMe();
  const [gFirst, ...gRest] = (me?.name || '').trim().split(/\s+/);
  const [first, setFirst] = useState(gFirst || '');
  const [last, setLast] = useState(gRest.join(' '));
  const [matches, setMatches] = useState<Contributor[] | null>(null);
  const [busy, setBusy] = useState(false);

  const fullName = `${first.trim()} ${last.trim()}`;
  const open = Object.values(fam.contributors).filter((c) => c.id !== 'none' && !fam.linkByContributor[c.id]);

  function next() {
    if (!first.trim() || !last.trim()) return toast('Type your first and last name');
    const found = likelyMatches(first, last, open);
    if (found.length) setMatches(found);
    else addNew();
  }
  async function pick(c: Contributor) {
    setBusy(true);
    try {
      await fam.linkMe(c.id);
      toast(`Welcome, ${c.short || c.name.split(' ')[0]}!`);
    } catch (e) {
      toast((e as Error).message || 'Couldn’t save that. Try again.');
      setBusy(false);
    }
  }
  async function addNew() {
    setBusy(true);
    try {
      await fam.addContributor(makeContributor(fullName, fam.contributors), true);
      toast(`Welcome, ${first.trim()}!`);
    } catch (e) {
      toast((e as Error).message || 'Couldn’t save that. Try again.');
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-inner">
        <picture>
          <source srcSet="/logo.webp" type="image/webp" />
          <img className="login-logo who-logo" src="/logo.png" alt="The Dunigan Recipes" />
        </picture>
        {!matches ? (
          <div className="join-box">
            <div className="t">Welcome! What’s your name?</div>
            <p className="field-help" style={{ margin: '4px 0 12px' }}>
              So your recipes and stories show up under your name.
            </p>
            <label className="field-label" htmlFor="who-first">
              First name
            </label>
            <input id="who-first" className="field" value={first} onChange={(e) => setFirst(e.target.value)} autoComplete="given-name" />
            <label className="field-label" htmlFor="who-last" style={{ marginTop: 10 }}>
              Last name
            </label>
            <input
              id="who-last"
              className="field"
              value={last}
              onChange={(e) => setLast(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && next()}
              autoComplete="family-name"
            />
            <button className="btn btn-accent btn-block" style={{ marginTop: 14 }} onClick={next} disabled={busy}>
              {busy ? 'Saving…' : 'Continue'}
            </button>
          </div>
        ) : (
          <div className="join-box">
            <div className="t">{matches.length === 1 ? 'Are you this person?' : 'Are you one of these people?'}</div>
            <p className="field-help" style={{ margin: '4px 0 12px' }}>
              {matches.length === 1 ? 'They’re' : 'These names are'} already in the recipe box. If it’s you, your recipes are waiting.
            </p>
            {matches.map((c) => {
              const n = fam.recipes.filter((r) => r.contributor === c.id).length;
              return (
                <button key={c.id} className="who-match" onClick={() => pick(c)} disabled={busy}>
                  <Avatar c={c} size={42} font={15} />
                  <span className="who-txt">
                    <span className="t2">{c.name}</span>
                    <span className="s2">
                      {c.rel ? c.rel + ' · ' : ''}
                      {plural(n, 'recipe')}
                    </span>
                  </span>
                  <span className="who-yes">Yes, that’s me</span>
                </button>
              );
            })}
            <button className="btn btn-outline btn-block" style={{ marginTop: 12 }} onClick={addNew} disabled={busy}>
              No, I’m {fullName}, someone new
            </button>
            <button className="link-btn" style={{ marginTop: 10 }} onClick={() => setMatches(null)} disabled={busy}>
              ‹ Fix my name
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Loading screen ---------- */

export function LoadingScreen({ done }: { done: boolean }) {
  // Keep the screen up for a moment so it reads as a welcome, then fade it out.
  const [minTime, setMinTime] = useState(false);
  const [maxTime, setMaxTime] = useState(false);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const a = setTimeout(() => setMinTime(true), 1200);
    // Safety net: never hold the app behind the logo for more than 8 seconds.
    const b = setTimeout(() => setMaxTime(true), 8000);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []);
  const leaving = (done && minTime) || maxTime;
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => setGone(true), 450);
    return () => clearTimeout(t);
  }, [leaving]);
  if (gone) return null;
  return (
    <div className={'loading-screen' + (leaving ? ' leaving' : '')} role="status" aria-label="Loading">
      <picture>
        <source srcSet="/logo.webp" type="image/webp" />
        <img className="ls-logo" src="/logo.png" alt="The Dunigan Recipes" />
      </picture>
      <div className="ls-dots" aria-hidden>
        <i />
        <i />
        <i />
      </div>
      <div className="ls-text">Gathering the recipe cards…</div>
    </div>
  );
}
