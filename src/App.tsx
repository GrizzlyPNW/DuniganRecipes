import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFamily } from './lib/store';
import { back, go, replace, useRoute } from './lib/router';
import { authClient } from './lib/auth';
import { setPendingInvite } from './lib/api';
import { MeContext, type Me } from './lib/session';
import { Home, type Filters } from './components/Home';
import { Family } from './components/Family';
import { Book } from './components/Book';
import { Menu, TabBar } from './components/Chrome';
import { Header, LoadingScreen, ProfilePanel } from './components/Account';
import { RecipePage } from './components/RecipePage';
import { CookMode } from './components/CookMode';
import { AddChooser, RecipeForm } from './components/AddRecipe';
import { Toast } from './components/bits';

export default function App() {
  const session = authClient.useSession();
  const user = session.data?.user;
  const me: Me | null = useMemo(
    () => (user ? { id: user.id, name: user.name || user.email, email: user.email, image: user.image } : null),
    [user?.id, user?.name, user?.email, user?.image], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const fam = useFamily(me?.id ?? null, session.isPending);
  const route = useRoute();
  const [filters, setFilters] = useState<Filters>({ query: '', cat: null, who: null });
  const [panel, setPanel] = useState<'menu' | 'profile' | null>(null);
  const [toastText, setToastText] = useState<string | null>(null);
  const [storiesNonce, setStoriesNonce] = useState(0);
  const toastTimer = useRef<number>();

  const toast = useCallback((t: string) => {
    clearTimeout(toastTimer.current);
    setToastText(t);
    toastTimer.current = window.setTimeout(() => setToastText(null), 2600);
  }, []);

  // Invite links look like https://site/#/join/<code>. Keep the code until the person
  // has signed in with Google; the family hook then uses it to join.
  useEffect(() => {
    if (route.name !== 'join') return;
    setPendingInvite(route.code);
    replace('');
    if (!me) {
      toast('Welcome! Sign in with Google to join the family box.');
      setPanel('profile');
    }
  }, [route, me, toast]);

  // Celebrate the moment someone becomes a member.
  const prevAccess = useRef(fam.access);
  useEffect(() => {
    if (prevAccess.current !== 'loading' && prevAccess.current !== 'member' && fam.access === 'member' && fam.mode === 'shared') {
      toast('Welcome to the family box');
      setPanel(null);
    }
    prevAccess.current = fam.access;
  }, [fam.access, fam.mode, toast]);

  useEffect(() => setPanel(null), [route]);

  const pickWho = (who: string) => {
    setFilters({ query: '', cat: null, who });
    go('');
  };

  const tab = route.name === 'family' ? 'family' : route.name === 'book' ? 'book' : 'home';
  const recipeId = route.name === 'recipe' || route.name === 'cook' || route.name === 'transcribe' ? route.id : null;
  const recipe = recipeId ? fam.recipes.find((r) => r.id === recipeId) : undefined;
  const overlay = !!recipeId || route.name === 'add' || route.name === 'new';

  return (
    <MeContext.Provider value={me}>
      <div className="app">
        {tab === 'home' && <Home fam={fam} f={filters} setF={setFilters} />}
        {tab === 'family' && <Family fam={fam} pick={pickWho} />}
        {tab === 'book' && <Book fam={fam} toast={toast} />}
        {!overlay && (
          <>
            <TabBar tab={tab} />
            <Header onMenu={() => setPanel('menu')} onProfile={() => setPanel('profile')} />
          </>
        )}
        {panel === 'menu' && <Menu tab={tab} count={fam.recipes.length} mode={fam.mode} close={() => setPanel(null)} />}
        {panel === 'profile' && <ProfilePanel fam={fam} close={() => setPanel(null)} toast={toast} />}

        {recipe && <RecipePage fam={fam} recipe={recipe} toast={toast} pickWho={pickWho} scrollTop={storiesNonce} />}
        {recipeId && !recipe && fam.ready && (
          <div className="overlay-page">
            <div className="screen pad">
              <div className="italic-empty">That recipe isn’t in the box.</div>
              <button className="btn btn-accent" onClick={() => replace('')}>
                Back to recipes
              </button>
            </div>
          </div>
        )}
        {route.name === 'cook' && recipe && (
          <CookMode
            recipe={recipe}
            from={fam.contributors[recipe.contributor] || fam.contributors.none}
            close={() => back('recipe/' + recipe.id)}
            toStories={() => {
              setStoriesNonce((n) => n + 1);
              back('recipe/' + recipe.id);
            }}
            toast={toast}
          />
        )}
        {route.name === 'transcribe' && recipe && <RecipeForm key={recipe.id} fam={fam} kind="transcribe" existing={recipe} toast={toast} />}
        {route.name === 'add' && <AddChooser fam={fam} toast={toast} />}
        {route.name === 'new' && <RecipeForm key={route.kind} fam={fam} kind={route.kind} toast={toast} />}

        {fam.error && !toastText && <Toast text={fam.error} />}
        <Toast text={toastText} />
        <LoadingScreen done={fam.ready && !session.isPending} />
      </div>
    </MeContext.Provider>
  );
}
