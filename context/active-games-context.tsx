import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';

export type ActiveGame = {
  id: string;
  name: string;
  route: string;
  color: string;
  storageKey: string;
  updatedAt: number;
};

type ActiveGamesContextType = {
  activeGames: ActiveGame[];
  upsertActiveGame: (game: Omit<ActiveGame, 'updatedAt'>) => void;
  clearActiveGame: (id: string) => void;
};

const ActiveGamesContext = createContext<ActiveGamesContextType | undefined>(undefined);

const STORAGE_KEY = '@activeGames';

export function ActiveGamesProvider({ children }: { children: ReactNode }) {
  const [activeGames, setActiveGames] = useState<ActiveGame[]>([]);

  useEffect(() => {
    void loadActiveGames();
  }, []);

  const loadActiveGames = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        setActiveGames(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Failed to load active games:', error);
    }
  };

  const saveActiveGames = async (games: ActiveGame[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(games));
    } catch (error) {
      console.error('Failed to save active games:', error);
    }
  };

  const upsertActiveGame = (game: Omit<ActiveGame, 'updatedAt'>) => {
    setActiveGames((prev) => {
      const existingIndex = prev.findIndex((g) => g.id === game.id);
      const updated: ActiveGame[] = [...prev];
      const withTimestamp: ActiveGame = { ...game, updatedAt: Date.now() };

      if (existingIndex >= 0) {
        updated[existingIndex] = withTimestamp;
      } else {
        updated.push(withTimestamp);
      }

      void saveActiveGames(updated);
      return updated;
    });
  };

  const clearActiveGame = (id: string) => {
    setActiveGames((prev) => {
      const updated = prev.filter((g) => g.id !== id);
      void saveActiveGames(updated);
      return updated;
    });
  };

  return (
    <ActiveGamesContext.Provider value={{ activeGames, upsertActiveGame, clearActiveGame }}>
      {children}
    </ActiveGamesContext.Provider>
  );
}

export function useActiveGames() {
  const ctx = useContext(ActiveGamesContext);
  if (!ctx) {
    throw new Error('useActiveGames must be used within an ActiveGamesProvider');
  }
  return ctx;
}

