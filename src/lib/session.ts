import { createContext, useContext } from 'react';

export interface Me {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

/** The signed-in Google user (or null), shared with every screen. */
export const MeContext = createContext<Me | null>(null);
export const useMe = () => useContext(MeContext);
