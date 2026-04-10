import { useGlobalSearchParams, usePathname } from 'expo-router';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

/** Stack + tab routes that count as “on a score sheet” (not the grid). */
const SCORE_SHEET_PATHNAMES = new Set([
  '/mexican-train',
  '/yahtzee',
  '/wizard',
  '/clue',
  '/scrabble',
  '/five-crowns',
  '/scattergories',
  '/hand-and-foot',
  '/rook',
  '/custom-score-sheet',
]);

function pathnameIsScoreSheet(pathname: string): boolean {
  return SCORE_SHEET_PATHNAMES.has(pathname);
}

function buildHref(pathname: string, params: Record<string, unknown>): string {
  const entries = Object.entries(params).filter(([key, v]) => {
    if (key.startsWith('__')) return false;
    if (v == null || v === '') return false;
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) return false;
    return true;
  });
  if (entries.length === 0) return pathname;
  const qs = new URLSearchParams();
  for (const [k, v] of entries) {
    if (Array.isArray(v)) {
      v.forEach((x) => qs.append(k, String(x)));
    } else {
      qs.set(k, String(v));
    }
  }
  const q = qs.toString();
  return q ? `${pathname}?${q}` : pathname;
}

type LastScoreSheetContextValue = {
  lastScoreSheetHref: string | null;
  setLastScoreSheetHref: (href: string | null) => void;
};

const LastScoreSheetContext = createContext<LastScoreSheetContextValue | null>(null);

export function LastScoreSheetProvider({ children }: { children: React.ReactNode }) {
  const [lastScoreSheetHref, setLastScoreSheetHref] = useState<string | null>(null);

  const value = useMemo(
    () => ({ lastScoreSheetHref, setLastScoreSheetHref }),
    [lastScoreSheetHref]
  );

  return (
    <LastScoreSheetContext.Provider value={value}>{children}</LastScoreSheetContext.Provider>
  );
}

export function useLastScoreSheet() {
  const ctx = useContext(LastScoreSheetContext);
  if (!ctx) {
    throw new Error('useLastScoreSheet must be used within LastScoreSheetProvider');
  }
  return ctx;
}

/**
 * Keeps `lastScoreSheetHref` in sync: set when viewing a sheet, cleared on the Score Sheets grid.
 */
/** Matches ScoreSheetBottomNav: avoids jarring transitions when jumping back to a sheet. */
export function withNoAnimationHref(href: string): string {
  const sep = href.includes('?') ? '&' : '?';
  return `${href}${sep}__internal_expo_router_no_animation=true`;
}

export function LastScoreSheetPathSync() {
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const { setLastScoreSheetHref } = useLastScoreSheet();

  const paramsKey = JSON.stringify(params);

  useEffect(() => {
    if (pathname === '/score-sheets' || pathname.endsWith('/score-sheets')) {
      setLastScoreSheetHref(null);
      return;
    }
    if (pathnameIsScoreSheet(pathname)) {
      setLastScoreSheetHref(buildHref(pathname, params as Record<string, unknown>));
    }
  }, [pathname, paramsKey, params, setLastScoreSheetHref]);

  return null;
}
