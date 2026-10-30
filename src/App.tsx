import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFamily } from './lib/store';
import { back, go, replace, useRoute, type Route } from './lib/router';
import { authClient } from './lib/auth';
import { setPendingInvite, setPendingToken } from './lib/api';
import { MeContext, type Me } from './lib/session';
import { Home, type Filters } from './components/Home';
import { Family } from './components/Family';
import { Book } from './components/Book';
import { Menu, TabBar, type Tab } from './components/Chrome';
import { AdminPage } from './components/Admin';
import { InvitePage } from './components/Invite';
import { Header, LoadingScreen, LoginScreen, ProfilePanel } from './components/Account';
import { RecipePage } from './components/RecipePage';
import { CookMode } from './components/CookMode';
import { AddChooser, RecipeForm } from './components/AddRecipe';
import { Layer, NavContext } from './components/Stack';
import { Toast } from './components/bits';

/** Root pages (menu button, tab bar). Everything else is pushed on top of them. */
const ROOTS: Partial<Record<Route['name'], Tab>> = {
  home: 'home',
  favorites: 'favorites',
  family: 'family',
  book: 'book',
  admin: 'admin',
  'invite-family': 'invite',
};

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

  // Invite links: #/join/<family code> or a personal #/i/<token>. Keep them until the
  // person has signed in with Google; the family hook then uses them.
  useEffect(() => {
    if (route.name === 'join') setPendingInvite(route.code);
    else if (route.name === 'claim') setPendingToken(route.token);
    else return;
    replace('');
    if (!me) toast('Welcome! Sign in with Google to join the family box.');
    else fam.refreshAccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // The root page stays put underneath pushed pages, like an iOS navigation stack.
  const routeTab = ROOTS[route.name];
  const [rootTab, setRootTab] = useState<Tab>(routeTab || 'home');
  useEffect(() => {
    if (routeTab) setRootTab(routeTab);
  }, [routeTab]);
  const tab = routeTab || rootTab;

  const pickWho = (who: string) => {
    setFilters({ query: '', cat: null, who });
    go('');
  };

  const recipeId = route.name === 'recipe' || route.name === 'cook' || route.name === 'transcribe' ? route.id : null;
  const recipe = recipeId ? fam.recipes.find((r) => r.id === recipeId) : undefined;

  // Layer 1: a recipe, or the Add Recipe chooser. Layer 2: a form pushed on top. Modal: cook mode.
  const addFlow = route.name === 'add' || route.name === 'new';
  const layer1Key = recipeId ? 'recipe:' + recipeId : addFlow ? 'add' : null;
  const layer2: ReactNode =
    route.name === 'transcribe' && recipe ? (
      <RecipeForm key={'t' + recipe.id} fam={fam} kind="transcribe" existing={recipe} toast={toast} />
    ) : route.name === 'new' ? (
      <RecipeForm key={route.kind} fam={fam} kind={route.kind} toast={toast} />
    ) : null;
  const cooking = route.name === 'cook' && !!recipe;

  const rootPage =
    tab === 'family' ? (
      <Family fam={fam} pick={pickWho} />
    ) : tab === 'book' ? (
      <Book fam={fam} toast={toast} />
    ) : tab === 'admin' ? (
      <AdminPage fam={fam} toast={toast} />
    ) : tab === 'invite' ? (
      <InvitePage fam={fam} toast={toast} />
    ) : (
      <Home fam={fam} f={filters} setF={setFilters} favorites={tab === 'favorites'} />
    );

  const nav = useMemo(() => ({ openMenu: () => setPanel('menu'), openProfile: () => setPanel('profile') }), []);

  return (
    <MeContext.Provider value={me}>
      <NavContext.Provider value={nav}>
        <div className="app">
          <div className={'base' + (layer1Key ? ' covered' : '')} aria-hidden={!!layer1Key}>
            <div key={tab} className="root-fade">
              {rootPage}
            </div>
            <TabBar tab={tab} />
            <Header />
          </div>

          <Layer show={!!layer1Key} covered={!!layer2 || cooking} z={20} onBack={() => back('')}>
            {recipe ? (
              <RecipePage key={recipe.id} fam={fam} recipe={recipe} toast={toast} pickWho={pickWho} scrollTop={storiesNonce} />
            ) : addFlow ? (
              <AddChooser fam={fam} toast={toast} />
            ) : recipeId && fam.ready ? (
              <div className="overlay-page">
                <Header onBack={() => back('')} backLabel="Recipes" />
                <div className="screen pad">
                  <div className="italic-empty">That recipe isn’t in the box.</div>
                </div>
              </div>
            ) : null}
          </Layer>

          <Layer show={!!layer2} z={22} onBack={() => back(recipe ? 'recipe/' + recipe.id : 'add')}>
            {layer2}
          </Layer>

          <Layer show={cooking} kind="modal" z={30}>
            {recipe && (
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
          </Layer>

          <Layer show={panel === 'menu'} kind="fade" z={40}>
            <Menu tab={tab} count={fam.recipes.length} mode={fam.mode} admin={fam.admin} close={() => setPanel(null)} />
          </Layer>
          <Layer show={panel === 'profile'} kind="fade" z={40}>
            <ProfilePanel fam={fam} close={() => setPanel(null)} toast={toast} />
          </Layer>

          {fam.error && !toastText && <Toast text={fam.error} />}
          {fam.mode === 'shared' && fam.ready && fam.access !== 'member' && <LoginScreen fam={fam} toast={toast} />}
          <Toast text={toastText} />
          <LoadingScreen done={fam.ready && !session.isPending} />
        </div>
      </NavContext.Provider>
    </MeContext.Provider>
  );
}
