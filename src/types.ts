export interface Contributor {
  id: string;
  name: string;
  short: string;
  ini: string;
  hue: number;
  rel?: string;
}

export interface Recipe {
  id: string;
  title: string;
  category: string;
  contributor: string;
  cardImages: string[];
  temp?: string | null;
  time?: string | null;
  makes?: string | null;
  note?: string | null;
  ingredients?: string[] | null;
  steps?: string[] | null;
  /** Set when someone names a cook who isn't in the list yet. */
  newContributor?: Contributor | null;
}

export interface Story {
  id: string;
  recipeId: string;
  authorName: string;
  text: string;
  createdAt: number;
}

export const isTyped = (r: Recipe) => !!r.ingredients && r.ingredients.length > 0;
