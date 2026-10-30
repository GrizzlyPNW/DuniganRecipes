import { useEffect, useState } from 'react';
import type { Contributor, Family } from '../lib/store';
import * as api from '../lib/api';
import { makeContributor, plural } from '../lib/util';
import { Avatar } from './bits';
import { AppPortal, Layer } from './Stack';

/** Admin: send each cook their own invite link by text. Signing up with it puts their recipes under their name. */
export function InvitePage({ fam, toast }: { fam: Family; toast: (t: string) => void }) {
  const [inviting, setInviting] = useState<Contributor | null>(null);
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
      setInviting(c);
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
        Text each cook their own link. When they sign in with it, their recipes show up under their name and they can add
        more. {joined > 0 && <b>{plural(joined, 'person has', 'people have')} joined.</b>}
      </p>

      {cooks.map((c) => {
        const link = fam.linkByContributor[c.id];
        const n = fam.recipes.filter((r) => r.contributor === c.id).length;
        return (
          <div key={c.id} className="invite-row">
            {link?.image ? (
              <img className="pf-img" src={link.image} alt="" width={44} height={44} referrerPolicy="no-referrer" />
            ) : (
              <Avatar c={c} size={44} font={15} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="t">
                {c.name}
                {c.rel ? ' · ' + c.rel : ''}
              </div>
              <div className="s">{plural(n, 'recipe')}</div>
            </div>
            {link ? (
              <span className="joined-badge">✓ Joined</span>
            ) : (
              <button className="btn btn-accent btn-sm" onClick={() => setInviting(c)}>
                Invite
              </button>
            )}
          </div>
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
        <Layer show={!!inviting} kind="fade" z={45}>
          {inviting && <InviteSheet person={inviting} close={() => setInviting(null)} toast={toast} />}
        </Layer>
      </AppPortal>
    </div>
  );
}

function InviteSheet({ person, close, toast }: { person: Contributor; close: () => void; toast: (t: string) => void }) {
  const [link, setLink] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .createInvite(person.id)
      .then((token) => setLink(`${location.origin}/#/i/${token}`))
      .catch((e) => setError((e as Error).message));
  }, [person.id]);

  const first = person.short || person.name.split(' ')[0];
  const message = link
    ? `Hi ${first}! The family recipe box is online now: The Dunigan Kitchen. Your recipes are already in it under your name. Tap this link and sign in with Google to join: ${link}`
    : '';
  const digits = phone.replace(/[^\d+]/g, '');
  const smsHref = `sms:${digits}?&body=${encodeURIComponent(message)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      toast('Invite copied. Paste it into a text.');
    } catch {
      toast('Couldn’t copy. Press and hold the message to copy it.');
    }
  }
  async function share() {
    try {
      await navigator.share({ title: 'The Dunigan Kitchen', text: message });
    } catch {
      /* cancelled */
    }
  }

  return (
    <>
      <div className="scrim" onClick={close} />
      <div className="sheet" role="dialog" aria-label={'Invite ' + person.name}>
        <div className="sheet-grab" />
        <div className="row-between" style={{ alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar c={person} size={40} font={14} />
            <h2 className="h2" style={{ fontSize: 22 }}>
              Invite {first}
            </h2>
          </div>
          <button className="link-btn" onClick={close}>
            Done
          </button>
        </div>

        {error ? (
          <p className="field-help">{error}</p>
        ) : !link ? (
          <div className="italic-empty" style={{ padding: '12px 0' }}>
            Making their link…
          </div>
        ) : (
          <>
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
            <div className="field-label">The text they’ll get</div>
            <div className="invite-link" style={{ fontSize: 14, marginBottom: 14 }}>
              {message}
            </div>
            <a className="btn btn-accent btn-block btn-big" href={smsHref} style={{ textDecoration: 'none' }}>
              Open Messages
            </a>
            <div className="two-btns">
              <button className="btn btn-outline" onClick={copy}>
                Copy text
              </button>
              {'share' in navigator ? (
                <button className="btn btn-outline" onClick={share}>
                  Share…
                </button>
              ) : (
                <button className="btn btn-outline" onClick={() => navigator.clipboard?.writeText(link).then(() => toast('Link copied'))}>
                  Copy link
                </button>
              )}
            </div>
            <p className="field-help" style={{ marginTop: 10 }}>
              This link is just for {first}. Once they use it, it stops working, so nobody else can join as them.
            </p>
          </>
        )}
      </div>
    </>
  );
}
