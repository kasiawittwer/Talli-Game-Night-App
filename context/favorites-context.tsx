import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';

export type FavoriteSheet = {
  id: string;
  name: string;
  color: string;
  route: string;
};

const CUSTOM_SHEETS_STORAGE_KEY = '@customSheets';

/** Returns the custom sheet id from a `/custom-score-sheet?sheetId=…` route, or null if not a custom sheet. */
function getCustomSheetIdFromRoute(route: string): string | null {
  if (!route.includes('custom-score-sheet')) return null;
  try {
    const q = route.split('?')[1];
    if (!q) return null;
    const id = new URLSearchParams(q).get('sheetId');
    return id || null;
  } catch {
    return null;
  }
}

async function loadValidCustomSheetIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  try {
    const raw = await AsyncStorage.getItem(CUSTOM_SHEETS_STORAGE_KEY);
    if (!raw) return ids;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return ids;
    for (const item of parsed) {
      if (item && typeof item === 'object' && 'id' in item && typeof (item as { id: unknown }).id === 'string') {
        ids.add((item as { id: string }).id);
      }
    }
  } catch {
    // ignore
  }
  return ids;
}

function filterFavoritesAgainstCustomSheets(
  list: FavoriteSheet[],
  validCustomIds: Set<string>
): FavoriteSheet[] {
  return list.filter((fav) => {
    const fromRoute = getCustomSheetIdFromRoute(fav.route);
    if (fromRoute === null) return true;
    return validCustomIds.has(fromRoute);
  });
}

type FavoritesContextType = {
  favorites: FavoriteSheet[];
  isFavorite: (id: string) => boolean;
  toggleFavorite: (sheet: FavoriteSheet) => void;
  /** Removes a favorite by sheet id (e.g. when a custom score sheet is deleted). */
  removeFavoriteById: (id: string) => void;
  /** Drops favorites whose custom sheet no longer exists in storage (repairs stale data). */
  reconcileFavoritesWithCustomSheets: () => Promise<void>;
};

const FavoritesContext = createContext<FavoritesContextType | undefined>(undefined);

const STORAGE_KEY = '@favorites';

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<FavoriteSheet[]>([]);

  const reconcileFavoritesWithCustomSheets = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      const list: FavoriteSheet[] = stored ? JSON.parse(stored) : [];
      const validIds = await loadValidCustomSheetIds();
      const cleaned = filterFavoritesAgainstCustomSheets(list, validIds);
      if (cleaned.length !== list.length) {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
      }
      setFavorites(cleaned);
    } catch (error) {
      console.error('Failed to reconcile favorites:', error);
    }
  }, []);

  useEffect(() => {
    void reconcileFavoritesWithCustomSheets();
  }, [reconcileFavoritesWithCustomSheets]);

  const saveFavorites = async (newFavorites: FavoriteSheet[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newFavorites));
    } catch (error) {
      console.error('Failed to save favorites:', error);
    }
  };

  const isFavorite = (id: string) => {
    return favorites.some((fav) => fav.id === id);
  };

  const toggleFavorite = (sheet: FavoriteSheet) => {
    setFavorites((prev) => {
      const exists = prev.some((fav) => fav.id === sheet.id);
      let newFavorites: FavoriteSheet[];

      if (exists) {
        newFavorites = prev.filter((fav) => fav.id !== sheet.id);
      } else {
        newFavorites = [...prev, sheet];
      }

      saveFavorites(newFavorites);
      return newFavorites;
    });
  };

  const removeFavoriteById = (id: string) => {
    setFavorites((prev) => {
      const newFavorites = prev.filter((fav) => {
        if (String(fav.id) === String(id)) return false;
        const routeId = getCustomSheetIdFromRoute(fav.route);
        return !(routeId !== null && routeId === id);
      });
      if (newFavorites.length === prev.length) return prev;
      saveFavorites(newFavorites);
      return newFavorites;
    });
  };

  return (
    <FavoritesContext.Provider
      value={{
        favorites,
        isFavorite,
        toggleFavorite,
        removeFavoriteById,
        reconcileFavoritesWithCustomSheets,
      }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const context = useContext(FavoritesContext);
  if (context === undefined) {
    throw new Error('useFavorites must be used within a FavoritesProvider');
  }
  return context;
}
