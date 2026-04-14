import Constants from 'expo-constants';

export type GameAssistantConfig = {
  openaiApiKey: string;
  /** Base URL only (no trailing slash), e.g. https://my-proxy.run.app — same idea as the class Express server */
  assistantApiUrl: string;
};

export type GameScoreSheetTemplate = {
  title: string;
  playerCount: number;
  rowLabels: string[];
};

export function getGameAssistantConfig(): GameAssistantConfig {
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;
  const envUrl =
    typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_GAME_ASSISTANT_API_URL
      ? String(process.env.EXPO_PUBLIC_GAME_ASSISTANT_API_URL).trim()
      : '';
  const envKey =
    typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_OPENAI_API_KEY
      ? String(process.env.EXPO_PUBLIC_OPENAI_API_KEY).trim()
      : '';
  const rawUrl = (extra.GAME_ASSISTANT_API_URL ?? envUrl ?? '').trim();
  const rawKey = (extra.OPENAI_API_KEY ?? envKey ?? '').trim();
  return {
    openaiApiKey: rawKey,
    assistantApiUrl: rawUrl.replace(/\/$/, ''),
  };
}

/** True if the app can reach an LLM (direct OpenAI key on device, or your backend proxy). */
export function hasCloudLlm(config: GameAssistantConfig): boolean {
  return Boolean(config.assistantApiUrl) || config.openaiApiKey.trim().length > 0;
}

/**
 * Chat completions: either your server (API key stays on server) or OpenAI from the client.
 * Body must match https://api.openai.com/v1/chat/completions
 */
export async function openaiChatCompletions(body: object): Promise<Response> {
  const { openaiApiKey, assistantApiUrl } = getGameAssistantConfig();
  if (assistantApiUrl) {
    return fetch(`${assistantApiUrl}/api/openai-proxy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  return fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify(body),
  });
}

function clampInt(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeLlmTemplate(raw: unknown): GameScoreSheetTemplate | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const titleRaw = typeof o.title === 'string' ? o.title.trim() : 'Game Name';
  const title = titleRaw.length >= 1 ? titleRaw : 'Game Name';

  let playerCount =
    typeof o.playerCount === 'number' && !Number.isNaN(o.playerCount)
      ? o.playerCount
      : parseInt(String(o.playerCount ?? ''), 10);
  if (Number.isNaN(playerCount)) playerCount = 3;
  playerCount = clampInt(playerCount, 1, 12);

  const rows = o.rowLabels;
  if (!Array.isArray(rows)) return null;
  const rowLabels = rows
    .map((x) => (typeof x === 'string' ? x.trim() : String(x ?? '')).trim())
    .filter((s) => s.length > 0);
  if (rowLabels.length === 0) return null;
  const trimmedRows = rowLabels.slice(0, 30);
  if (trimmedRows.length < 5) return null;
  return {
    title,
    playerCount,
    rowLabels: trimmedRows,
  };
}

/**
 * Interpret natural language into a score sheet template (rules + rows). Falls back if no LLM or parse error.
 */
export async function generateScoreSheetTemplateFromLlm(
  prompt: string,
  inferFallback: (p: string) => GameScoreSheetTemplate
): Promise<GameScoreSheetTemplate> {
  const trimmed = prompt.trim();
  if (!trimmed) return inferFallback(prompt);

  const cfg = getGameAssistantConfig();
  if (!hasCloudLlm(cfg)) {
    return inferFallback(prompt);
  }

  const system =
    'You design compact score sheets for tabletop games. Reply with JSON only. ' +
    'Fields: title (short game name), playerCount (integer 1–12; use 1 for solo scoring), rowLabels (array of strings, one label per scoring row, e.g. rounds 1–12 or trick numbers). ' +
    'The app shows at most 4 player columns per table; more than 4 players means multiple stacked tables. ' +
    'Prefer 5–20 rows unless the user clearly needs more (max 30).';

  const body = {
    model: 'gpt-4o-mini',
    temperature: 0.2,
    max_tokens: 600,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      {
        role: 'user',
        content: `Score sheet request:\n${trimmed}\n\nReturn: {"title":"...","playerCount":6,"rowLabels":["1","2","3"]}`,
      },
    ],
  };

  try {
    const res = await openaiChatCompletions(body);
    if (!res.ok) {
      return inferFallback(prompt);
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const rawText = json?.choices?.[0]?.message?.content?.trim() ?? '';
    if (!rawText) return inferFallback(prompt);
    const parsed = JSON.parse(rawText) as unknown;
    const normalized = normalizeLlmTemplate(parsed);
    return normalized ?? inferFallback(prompt);
  } catch {
    return inferFallback(prompt);
  }
}
