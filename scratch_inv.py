p='src/components/Invite.tsx'
s=open(p,encoding='utf-8').read()
old_row=s[s.index('          <div key={c.id} className="invite-row">'):s.index('        );\n      })}')]
new_row='''          <button key={c.id} className="invite-row" onClick={() => setInviting(c)} aria-label={'Open ' + c.name}>
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
            {link ? <span className="joined-badge">✓ Joined</span> : <span className="invite-chip">Invite</span>}
            <span className="chev">›</span>
          </button>
'''
s=s.replace(old_row,new_row)
s=s.replace("Text each cook their own link. When they sign in with it, their recipes show up under their name and they can add\n        more.","Tap anyone to text them their own invite. When they join with it, their recipes show up under their name and they\n        can add more.")
s=s.replace("{inviting && <InviteSheet person={inviting} close={() => setInviting(null)} toast={toast} />}",
 "{inviting && (\n            <InviteSheet\n              person={inviting}\n              joined={fam.linkByContributor[inviting.id] || null}\n              recipes={fam.recipes.filter((r) => r.contributor === inviting.id).length}\n              close={() => setInviting(null)}\n              toast={toast}\n            />\n          )}")
open(p,'w',encoding='utf-8').write(s)
