import { useCallback, useEffect, useRef, useState } from 'react';
import { useFamily } from './lib/store';
import { back, go, replace, useRoute } from './lib/router';
import { Home, type Filters } from './components/Home';
import { Family } from './components/Family';
import { Book } from './components/Book';
import { Menu, MenuButton, TabBar } from './components/Chrome';
import { RecipePage } from './components/RecipePage';
import { CookMode } from './components/CookMode';
import { AddChooser, RecipeForm } from './components/AddRecipe';
import { Toast } from './components/bits';

export default function App() {
  const fam = useFamily();
  const route = useRoute();
  const [filters, setFilters] = useState<Filters>({ query: '', cat: null, who: null });
  const [menu, setMenu] = useState(false);
  const [toastText, setToastText] = useState<string | null>(null);
  const [storiesNonce, setStoriesNonce] = useState(0);
  const toastTimer = useRef<number>();

  const toast = useCallback((t: string) => {
    clearTimeout(toastTimer.current);
    setToastText(t);
    toastTimer.current = window.setTimeout(() => setToastText(null), 2400);
  }, []);

  // Invite links look like https://site/#/join/<code>
  useEffect(() => {
    if (route.name !== 'join' || !fam.mode) return;
    fam.join(route.code).then((ok) => {
      toast(ok ? 'Welcome to the family box' : 'That invite link didn’t work. Ask for a new one.');
      replace('');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, fam.mode]);

  useEffect(() => setMenu(false), [route]);

  const pickWho = (who: string) => {
    setFilters({ query: '', cat: null, who });
    go('');
  };

  const tab = route.name === 'family' ? 'family' : route.name === 'book' ? 'book' : 'home';
  const recipeId = route.name === 'recipe' || route.name === 'cook' || route.name === 'transcribe' ? route.id : null;
  const recipe = recipeId ? fam.recipes.find((r) => r.id === recipeId) : undefined;
  const overlay = !!recipeId || route.name === 'add' || route.name === 'new';

  return (
    <div className="app">
      {tab === 'home' && <Home fam={fam} f={filters} setF={setFilters} />}
      {tab === 'family' && <Family fam={fam} pick={pickWho} />}
      {tab === 'book' && <Book fam={fam} toast={toast} />}
      {!overlay && (
        <>
          <TabBar tab={tab} />
          <MenuButton onOpen={() => setMenu(true)} />
        </>
      )}
      {menu && !overlay && <Menu tab={tab} count={fam.recipes.length} mode={fam.mode} close={() => setMenu(false)} />}

      {recipe && (
        <RecipePage fam={fam} recipe={recipe} toast={toast} pickWho={pickWho} scrollTop={storiesNonce} />
      )}
      {recipeId && !recipe && fam.mode && (
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
      {route.name === 'add' && <AddChooser />}
      {route.name === 'new' && <RecipeForm key={route.kind} fam={fam} kind={route.kind} toast={toast} />}

      {fam.error && !toastText && <Toast text={fam.error} />}
      <Toast text={toastText} />
    </div>
  );
}
