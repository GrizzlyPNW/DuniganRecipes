import { useCallback, useEffect, useState } from 'react';
import type { Family } from '../lib/store';
import * as api from '../lib/api';
import { plural } from '../lib/util';
import { ProfileIcon } from './Account';

/** Admin only: the invite link and who's in the family box. */
export function AdminPage({ fam, toast }: { fam: Family; toast: (t: string) => void }) {
  const [members, setMembers] = useState<api.Member[] | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [savingCode, setSavingCode] = useState(false);

  const [changes, setChanges] = useState<api.Change[] | null>(null);
  const [moreChanges, setMoreChanges] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [backingUp, setBackingUp] = useState(false);

  const load = useCallback(async () => {
    try {
      const [m, c, ch] = await Promise.all([api.listMembers(), api.getInviteCode(), api.listChanges()]);
      setMembers(m);
      setCode(c);
      setChanges(ch);
    } catch (e) {
      toast((e as Error).message);
    }
  }, [toast]);

  useEffect(() => {
    if (fam.mode === 'shared' && fam.admin) load();
  }, [fam.mode, fam.admin, load]);

  if (!fam.admin) {
    return (
      <div className="screen with-tabs pad">
        <div className="italic-empty">Only the family admin can see this page.</div>
      </div>
    );
  }
  if (fam.mode === 'local') {
    return (
      <div className="screen with-tabs pad">
        <h1 className="h1">Manage family</h1>
        <p className="lead">The family database isn’t connected here, so there are no members to manage.</p>
      </div>
    );
  }

  const link = code ? `${location.origin}/#/join/${encodeURIComponent(code)}` : '';

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast('Invite link copied');
    } catch {
      setShowCode(true);
    }
  }
  async function share() {
    try {
      await navigator.share({
        title: 'The Dunigan Recipes',
        text: 'Join the Dunigan family recipe box. Open this link and sign in with Google:',
        url: link,
      });
    } catch {
      /* cancelled */
    }
  }
  async function saveCode() {
    const next = draft.trim();
    if (!/^[A-Za-z0-9-]{4,40}$/.test(next)) return toast('Use 4 to 40 letters, numbers or dashes');
    if (next === code) return setEditing(false);
    if (!confirm('Change the family code? The old code and old invite links will stop working. People already in stay in.')) return;
    setSavingCode(true);
    try {
      setCode(await api.setFamilyCode(next));
      setEditing(false);
      toast('Family code changed');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setSavingCode(false);
    }
  }

  async function toggle(m: api.Member) {
    const removing = !m.blocked;
    if (removing && !confirm(`Remove ${m.name} from the family box? They won’t be able to see stories until you restore them.`)) return;
    setBusyId(m.id);
    try {
      await api.setMemberRemoved(m.id, removing);
      toast(removing ? `${m.name} was removed` : `${m.name} is back in`);
      await load();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  // What a change was about, in words. Older versions carry their own name; new ones are looked up.
  const nameOf = (it: api.Change['items'][number]) =>
    it.label ||
    (it.kind === 'recipe' ? fam.recipes.find((r) => r.id === it.itemId)?.title : it.kind === 'tree' ? fam.tree.find((p) => p.id === it.itemId)?.name : '') ||
    'someone';
  const describe = (c: api.Change) => {
    const it = c.items[0];
    const names = [...new Set(c.items.map(nameOf))];
    const list = names.slice(0, 3).join(', ') + (names.length > 3 ? ' and ' + (names.length - 3) + ' more' : '');
    if (it.action === 'restore') return 'Put back an earlier version: ' + list;
    if (it.kind === 'story') return 'Deleted a story: “' + (it.label.length > 60 ? it.label.slice(0, 60) + '…' : it.label) + '”';
    if (it.kind === 'recipe') return (it.had ? 'Edited ' : 'Changed the original card of ') + list;
    if (c.items.some((x) => x.action === 'remove')) return 'Took ' + nameOf(c.items.find((x) => x.action === 'remove')!) + ' off the tree';
    return 'Changed the tree: ' + list;
  };
  async function putBack(c: api.Change) {
    if (!confirm('Put back the version from before this change? Anything changed on these since will be replaced too. You can undo this the same way.')) return;
    setRestoring(c.batch);
    try {
      await api.restoreChange(c.batch);
      await fam.refresh();
      setChanges(await api.listChanges());
      toast('Put back');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setRestoring(null);
    }
  }
  async function backup() {
    setBackingUp(true);
    try {
      const data = await api.exportAll();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'dunigan-recipes-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      toast('Backup downloaded');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBackingUp(false);
    }
  }

  const active = members?.filter((m) => !m.blocked) || [];
  const removed = members?.filter((m) => m.blocked) || [];

  return (
    <div className="screen with-tabs pad">
      <div className="eyebrow">Admin</div>
      <h1 className="h1">Manage family</h1>

      <div className="admin-card">
        <div className="t">Invite link</div>
        <p className="field-help" style={{ margin: '4px 0 12px' }}>
          Send this to family. They open it, sign in with Google, and they’re in.
        </p>
        {showCode && <div className="invite-link">{link}</div>}
        <div className="two-btns" style={{ marginTop: showCode ? 10 : 0 }}>
          <button className="btn btn-accent" onClick={copy} disabled={!code}>
            Copy link
          </button>
          {'share' in navigator ? (
            <button className="btn btn-outline" onClick={share} disabled={!code}>
              Share…
            </button>
          ) : (
            <button className="btn btn-outline" onClick={() => setShowCode(!showCode)} disabled={!code}>
              {showCode ? 'Hide link' : 'Show link'}
            </button>
          )}
        </div>
      </div>

      <div className="admin-card" style={{ marginTop: 12 }}>
        <div className="row-between" style={{ alignItems: 'center' }}>
          <div className="t">Family code</div>
          {!editing && (
            <button
              className="link-btn"
              disabled={!code}
              onClick={() => {
                setDraft(code || '');
                setEditing(true);
              }}
            >
              Change
            </button>
          )}
        </div>
        <p className="field-help" style={{ margin: '4px 0 12px' }}>
          Family can type this in after signing in instead of using the link. Only you can see or change it.
        </p>
        {editing ? (
          <>
            <input
              className="field"
              value={draft}
              onChange={(e) => setDraft(e.target.value.replace(/\s/g, ''))}
              aria-label="New family code"
              autoCapitalize="characters"
              autoComplete="off"
              autoFocus
            />
            <p className="field-help">4 to 40 letters, numbers or dashes.</p>
            <div className="two-btns" style={{ marginTop: 10 }}>
              <button className="btn btn-outline" onClick={() => setEditing(false)} disabled={savingCode}>
                Cancel
              </button>
              <button className="btn btn-accent" onClick={saveCode} disabled={savingCode}>
                {savingCode ? 'Saving…' : 'Save code'}
              </button>
            </div>
          </>
        ) : (
          <div className="family-code">{code ?? '…'}</div>
        )}
        <p className="field-help" style={{ marginTop: 10 }}>
          If the link spreads too far, change the code. The old code and link stop working; people already in stay in.
        </p>
      </div>

      <div className="row-between" style={{ margin: '24px 0 4px' }}>
        <h2 className="h2" style={{ fontSize: 22 }}>
          In the family box
        </h2>
        <span className="meta">{members ? plural(active.length, 'person', 'people') : ''}</span>
      </div>
      {!members && <div className="italic-empty">Loading…</div>}
      {active.map((m) => (
        <MemberRow key={m.id} m={m} busy={busyId === m.id} onToggle={() => toggle(m)} />
      ))}

      {removed.length > 0 && (
        <>
          <h2 className="h2" style={{ fontSize: 22, margin: '24px 0 4px' }}>
            Removed
          </h2>
          {removed.map((m) => (
            <MemberRow key={m.id} m={m} busy={busyId === m.id} onToggle={() => toggle(m)} />
          ))}
        </>
      )}

      <h2 className="h2" style={{ fontSize: 22, margin: '28px 0 4px' }}>
        Recent changes
      </h2>
      <p className="field-help" style={{ margin: '0 0 8px' }}>
        If someone changes or deletes something by mistake, put back the earlier version here.
      </p>
      {!changes && <div className="italic-empty">Loading…</div>}
      {changes?.length === 0 && <div className="italic-empty">No changes yet. Edits to recipes and the tree, and deleted stories, will show here.</div>}
      {changes?.slice(0, moreChanges ? undefined : 8).map((c) => (
        <div key={c.batch} className="change-row">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="t">{describe(c)}</div>
            <div className="s">
              {c.by || 'Someone'} · {new Date(c.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </div>
          </div>
          {c.restored ? (
            <span className="meta">Put back ✓</span>
          ) : (
            <button className="btn btn-outline" onClick={() => putBack(c)} disabled={!!restoring}>
              {restoring === c.batch ? '…' : 'Put back'}
            </button>
          )}
        </div>
      ))}
      {changes && changes.length > 8 && !moreChanges && (
        <button className="link-btn" onClick={() => setMoreChanges(true)}>
          Show older changes
        </button>
      )}

      <div className="admin-card" style={{ marginTop: 28 }}>
        <div className="t">Back up the family box</div>
        <p className="field-help" style={{ margin: '4px 0 12px' }}>
          Downloads one file with every recipe edit, story, cook, tree person and favorite. Keep it somewhere safe, like your Google Drive. Photos stay online; the file lists their links. It includes members’ emails, so don’t share it.
        </p>
        <button className="btn btn-accent btn-block" onClick={backup} disabled={backingUp}>
          {backingUp ? 'Preparing…' : 'Download backup'}
        </button>
      </div>
    </div>
  );
}

function MemberRow({ m, busy, onToggle }: { m: api.Member; busy: boolean; onToggle: () => void }) {
  return (
    <div className={'member-row' + (m.blocked ? ' removed' : '')}>
      <ProfileIcon me={{ id: m.id, name: m.name || m.email, email: m.email, image: m.image }} size={42} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="t">
          {m.name}
          {m.isYou && <span className="you-badge">You · admin</span>}
        </div>
        <div className="s">{m.email}</div>
        <div className="s">
          Joined {new Date(m.joinedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} ·{' '}
          {plural(m.stories, 'story', 'stories')}
        </div>
      </div>
      {!m.isYou && (
        <button className={'btn ' + (m.blocked ? 'btn-outline' : 'btn-remove')} onClick={onToggle} disabled={busy}>
          {busy ? '…' : m.blocked ? 'Restore' : 'Remove'}
        </button>
      )}
    </div>
  );
}
