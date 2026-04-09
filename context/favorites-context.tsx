import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

import { Colors } from '@/constants/theme';

export type FavoriteSheet = {
  id: string;
  name: string;
  color: string;
  route: string;
};

type FavoritesContextType = {
  favorites: FavoriteSheet[];
  isFavorite: (id: string) => boolean;
  toggleFavorite: (sheet: FavoriteSheet) => void;
};

const FavoritesContext = createContext<FavoritesContextType | undefined>(undefined);

const STORAGE_KEY = '@favorites';

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<FavoriteSheet[]>([]);

  useEffect(() => {
    loadFavorites();
  }, []);

  const loadFavorites = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        setFavorites(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Failed to load favorites:', error);
    }
  };

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

  return (
    <FavoritesContext.Provider value={{ favorites, isFavorite, toggleFavorite }}>
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
