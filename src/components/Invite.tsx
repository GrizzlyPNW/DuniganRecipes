import { useEffect, useState } from 'react';
import type { Contributor, Family } from '../lib/store';
import * as api from '../lib/api';
import { makeContributor, plural } from '../lib/util';
import { Avatar } from './bits';
import { AppPortal, Layer } from './Stack';

// Invites always point at the family's own address, even when sent from an older link.
const SITE = /\.vercel\.app$/.test(location.hostname) ? 'https://www.duniganrecipes.com' : location.origin;
/** "K7QM2P" → "K7Q-M2P", easier to read out loud or type. Older long codes stay as they are. */
const pretty = (code: string) => (code.length === 6 ? code.slice(0, 3) + '-' + code.slice(3) : code);

/** Admin: the family list. Tap a person to see their profile and text them their own invite. */
export function InvitePage({ fam, toast }: { fam: Family; toast: (t: string) => void }) {
  const [open, setOpen] = useState<Contributor | null>(null);
  const [newName, setNewName] = useState('');

  if (!fam.admin || fam.mode !== 'shared') {
    return (
      <div className="screen with-tabs pad">
        <div className="italic-empty">Only the family admin can send invites.</div>
      </div>
    );
  }

  const cooks = Object.values(fam.contributors)
    .filter((c) => c.id !== 'none')
    .sort((a, b) => Number(!!fam.linkByContributor[a.id]) - Number(!!fam.linkByContributor[b.id]) || a.name.localeCompare(b.name));
  const joined = cooks.filter((c) => fam.linkByContributor[c.id]).length;

  async function addPerson() {
    if (!newName.trim()) return toast('Type their name first');
    try {
      const c = await fam.addContributor(makeContributor(newName, fam.contributors), false);
      setNewName('');
      setOpen(c);
    } catch (e) {
      toast((e as Error).message || 'Couldn’t add them.');
    }
  }

  return (
    <div className="screen with-tabs pad">
      <div className="eyebrow">Admin</div>
      <h1 className="h1" style={{ marginBottom: 6 }}>
        Invite family
      </h1>
      <p className="lead">
        Tap anyone to text them their own invite code. When they join with it, their recipes show up under their name.{' '}
        {joined > 0 && <b>{plural(joined, 'person has', 'people have')} joined.</b>}
      </p>

      {cooks.map((c) => {
        const link = fam.linkByContributor[c.id];
        const n = fam.recipes.filter((r) => r.contributor === c.id).length;
        return (
          <button key={c.id} className="invite-row" onClick={() => setOpen(c)}>
            {link?.image ? (
              <img className="pf-img" src={link.image} alt="" width={44} height={44} referrerPolicy="no-referrer" />
            ) : (
              <Avatar c={c} size={44} font={15} />
            )}
            <span className="invite-txt">
              <span className="t">
                {c.name}
                {c.rel ? ' · ' + c.rel : ''}
              </span>
              <span className="s">{plural(n, 'recipe')}</span>
            </span>
            {link ? <span className="joined-badge">✓ Joined</span> : <span className="invite-chip">Invite</span>}
            <span className="chev" aria-hidden>
              ›
            </span>
          </button>
        );
      })}

      <div className="admin-card" style={{ marginTop: 20 }}>
        <div className="t">Someone not on the list?</div>
        <p className="field-help" style={{ margin: '4px 0 10px' }}>
          Add them, then text them an invite. Recipes they add will live under their name.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="field" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Their name" aria-label="Their name" />
          <button className="btn btn-accent" onClick={addPerson}>
            Add
          </button>
        </div>
      </div>

      <AppPortal>
        <Layer show={!!open} kind="fade" z={45}>
          {open && (
            <PersonSheet
              person={open}
              joined={fam.linkByContributor[open.id] || null}
              recipes={fam.recipes.filter((r) => r.contributor === open.id).length}
              close={() => setOpen(null)}
              toast={toast}
            />
          )}
        </Layer>
      </AppPortal>
    </div>
  );
}

/** One person's profile: who they are, and (if they haven't joined) a text with their invite code. */
function PersonSheet({
  person,
  joined,
  recipes,
  close,
  toast,
}: {
  person: Contributor;
  joined: api.Link | null;
  recipes: number;
  close: () => void;
  toast: (t: string) => void;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (joined) return;
    api
      .createInvite(person.id)
      .then(setCode)
      .catch((e) => setError((e as Error).message));
  }, [person.id, joined]);

  const first = (person.short || person.name.split(' ')[0]).replace(/.$/, '');
  const link = code ? `${SITE}/#/i/${code}` : '';
  const message = code
    ? `Hi ${first}! The family recipe box is online: The Dunigan Recipes. ` +
      (recipes ? 'Your recipes are already in it under your name. ' : '') +
      `Tap this link and sign in with Google to join: ${link}\n\nOr go to ${SITE.replace(/^https:\/\//, '')}, sign in, and enter your code: ${pretty(code)}`
    : '';
  const digits = phone.replace(/[^\d+]/g, '');
  const smsHref = `sms:${digits}?&body=${encodeURIComponent(message)}`;

  async function copy(text: string, done: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast(done);
    } catch {
      toast('Couldn’t copy. Press and hold to copy it.');
    }
  }

  return (
    <>
      <div className="scrim" onClick={close} />
      <div className="sheet" role="dialog" aria-label={person.name}>
        <div className="sheet-grab" />
        <div className="row-between" style={{ alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            {joined?.image ? (
              <img className="pf-img" src={joined.image} alt="" width={52} height={52} referrerPolicy="no-referrer" />
            ) : (
              <Avatar c={person} size={52} font={18} />
            )}
            <div style={{ minWidth: 0 }}>
              <h2 className="h2" style={{ fontSize: 22 }}>
                {person.name}
              </h2>
              <div className="field-help" style={{ margin: 0 }}>
                {person.rel ? person.rel + ' · ' : ''}
                {plural(recipes, 'recipe')}
              </div>
            </div>
          </div>
          <button className="link-btn" onClick={close}>
            Done
          </button>
        </div>

        {joined ? (
          <div className="pf-status">
            ✓ {first} joined{joined.name && joined.name !== person.name ? ` as ${joined.name}` : ''}. Their recipes and stories are under their
            name.
          </div>
        ) : error ? (
          <p className="field-help">{error}</p>
        ) : !code ? (
          <div className="italic-empty" style={{ padding: '12px 0' }}>
            Making their code…
          </div>
        ) : (
          <>
            <div className="invite-code-box">
              <div className="field-label" style={{ margin: 0 }}>
                {first}’s invite code
              </div>
              <button className="invite-code" onClick={() => copy(pretty(code), 'Code copied')} aria-label="Copy the code">
                {pretty(code)}
              </button>
              <div className="field-help" style={{ margin: 0 }}>
                Only works once, and only for {first}.
              </div>
            </div>
            <div className="form-group">
              <label className="field-label" htmlFor="inv-phone">
                Their phone number (optional)
              </label>
              <input
                id="inv-phone"
                className="field"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 123-4567"
              />
              <p className="field-help">Leave it blank to pick them from your contacts in Messages.</p>
            </div>
            <a className="btn btn-accent btn-block btn-big" href={smsHref} style={{ textDecoration: 'none' }}>
              Text {first} the code
            </a>
            <div className="two-btns">
              <button className="btn btn-outline" onClick={() => copy(message, 'Invite copied. Paste it into a text.')}>
                Copy text
              </button>
              {typeof navigator.share === 'function' ? (
                <button
                  className="btn btn-outline"
                  onClick={() => navigator.share({ title: 'The Dunigan Recipes', text: message }).catch(() => {})}
                >
                  Share…
                </button>
              ) : (
                <button className="btn btn-outline" onClick={() => copy(link, 'Link copied')}>
                  Copy link
                </button>
              )}
            </div>
            <details className="invite-preview">
              <summary>See the text they’ll get</summary>
              <div className="invite-link" style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>
                {message}
              </div>
            </details>
          </>
        )}
      </div>
    </>
  );
}
