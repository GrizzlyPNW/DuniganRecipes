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

  const load = useCallback(async () => {
    try {
      const [m, c] = await Promise.all([api.listMembers(), api.getInviteCode()]);
      setMembers(m);
      setCode(c);
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
        <p className="field-help" style={{ marginTop: 10 }}>
          If the link spreads too far, change <b>FAMILY_CODE</b> in Vercel and redeploy. People already in stay in.
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
