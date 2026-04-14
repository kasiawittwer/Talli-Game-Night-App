import { getGameAssistantConfig } from '@/lib/game-assistant-llm';

const GAMERULES_ORIGIN = 'https://gamerules.com';

/**
 * Extra search queries and URL-slug keywords for games known under multiple names on gamerules.com
 * (e.g. “Scum” → President / Asshole).
 */
export const GAMERULES_GAME_ALIASES: Record<string, { queries: string[]; slugKeywords: string[] }> = {
  scum: {
    queries: ['president card game', 'president', 'asshole card game'],
    slugKeywords: ['president', 'asshole', 'scum'],
  },
  president: {
    queries: ['president card game'],
    slugKeywords: ['president', 'scum'],
  },
  asshole: {
    queries: ['asshole card game', 'president card game'],
    slugKeywords: ['asshole', 'president'],
  },
};

const MAX_HTML_CHARS = 1_500_000;

/**
 * Fetch HTML from gamerules.com. On web, direct fetch is often blocked by CORS; when
 * GAME_ASSISTANT_API_URL is set, the optional Express server proxies the request.
 */
export async function fetchGamerulesHtml(url: string): Promise<string | null> {
  const { assistantApiUrl } = getGameAssistantConfig();
  if (assistantApiUrl) {
    try {
      const proxyUrl = `${assistantApiUrl}/api/gamerules-fetch?url=${encodeURIComponent(url)}`;
      const res = await fetch(proxyUrl);
      if (!res.ok) return null;
      const text = await res.text();
      if (text.length > MAX_HTML_CHARS) return text.slice(0, MAX_HTML_CHARS);
      return text;
    } catch {
      return null;
    }
  }
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'Mozilla/5.0 (compatible; GameAssistant/1.0; +https://github.com/)',
      },
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (text.length > MAX_HTML_CHARS) return text.slice(0, MAX_HTML_CHARS);
    return text;
  } catch {
    return null;
  }
}

export { GAMERULES_ORIGIN };
