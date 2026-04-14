import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import type { TextInput as TextInputType } from 'react-native';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardTextInput as TextInput } from '@/components/keyboard-text-input';
import { ThemedView } from '@/components/themed-view';
import { keyboardVerticalOffsetBelowSiblingHeader } from '@/constants/keyboard';
import { Colors, Fonts, SCREEN_EXTRA_TOP_PADDING, TABLET_MIN_WIDTH } from '@/constants/theme';
import { useLayoutDimensions } from '@/hooks/use-layout-dimensions';
import { fetchGamerulesHtml, GAMERULES_GAME_ALIASES, GAMERULES_ORIGIN } from '@/lib/gamerules-fetch';
import { getGameAssistantConfig, hasCloudLlm, openaiChatCompletions } from '@/lib/game-assistant-llm';

type Message = {
  id: string;
  text: string;
  imageUri?: string;
  isUser: boolean;
};

type HouseRule = {
  id: string;
  gameName: string;
  rules: string[];
};

type Tab = 'rulebook' | 'house-rules';

type RulebookSavedChat = {
  id: string;
  title: string;
  messages: Message[];
  threadGame: string | null;
  updatedAt: number;
};

/** Shown for general Rook questions; swapped for concrete counters on scoring follow-ups. */
const ROOK_EDITION_LINE =
  'Which ranks count as “counters” and how many points each is worth varies by edition—use your deck’s rules or add them in House Rules.';

/** Offline fallback only—do not name 1s or other variant-specific values; website excerpt + House Rules win when present. */
const ROOK_SCORING_REFERENCE =
  'Common Rook counter values and worth (when your deck matches this scheme): 5s = 5, 10s = 10, 14s = 10, Rook Bird = 20. For ranks not listed here, follow your deck or add House Rules for this game—do not assume other point values.';

function looksLikeRookScoringQuestion(qLower: string): boolean {
  return (
    /\b(worth|points?|value|counter|scoring|how many points)\b/i.test(qLower) ||
    /\bhow\s+much\b/i.test(qLower) ||
    /\bwhat\s+are\s+(they|those)\b/i.test(qLower) ||
    /\b(1s|5s|10s|14s?|rook\s*bird)\b/i.test(qLower) ||
    /\b(5|10|14)\b/.test(qLower)
  );
}

/** Coach lines that ask the user for input; they must not be the only match for short replies like "round 1". */
function stripTellMeCoachLines(text: string): string {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((line) => !/^\s*tell me\b/i.test(line))
    .join('\n');
}

function looksLikeShortAnswerFragment(question: string): boolean {
  const t = question.trim();
  if (t.length < 1 || t.length > 80) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length > 8) return false;
  if (/^(yes|no|yep|nope|ok|sure|yeah|nah)\b\.?$/i.test(t)) return true;
  if (/^round\s*[1-4]\b/i.test(t)) return true;
  if (/^\d{1,2}$/.test(t)) return true;
  if (/^(team|player|p)\s*\d+/i.test(t)) return true;
  if (/^(what|how|why|when|where|who|which|explain|describe|tell|define)\b/i.test(t)) return false;
  if (/\b(play|rules|explain|meaning|describe|define|summarize|list)\b/i.test(t)) return false;
  if (words.length <= 4 && t.length <= 28) return true;
  return false;
}

function shortAnswerAcknowledgmentLine(
  question: string,
  gameKey: string,
  gameDisplayName: string
): string {
  const t = question.trim();
  const lower = t.toLowerCase();
  const rm = lower.match(/^round\s*([1-4])\b/);
  if (rm && gameKey === 'hand-and-foot') {
    return `Got it — you’re on round ${rm[1]}. Typical focus: build Books from your Hand, then work through your Foot when your rules allow.`;
  }
  if (/^(yes|no|yep|nope|ok|sure|yeah|nah)\b\.?$/i.test(t)) {
    return `Thanks — noted. What should we tackle next for ${gameDisplayName}? (Your cards, a meld you want to lay down, or going out.)`;
  }
  if (/^\d{1,2}$/.test(t) && gameKey === 'wizard') {
    return `Noted. Say who was dealer and what each player bid if you want help filling the score sheet.`;
  }
  return `Thanks — I’ve got that. Add what you’re trying to do next for ${gameDisplayName} (cards, melds, or a rule check) and I can help.`;
}

type RulebookPersistedPayload = {
  draft: { messages: Message[]; threadGame: string | null };
  history: RulebookSavedChat[];
};

const RULEBOOK_CHATS_STORAGE_KEY = '@rulebook_chats_v1';
const HOUSE_RULES_STORAGE_KEY = '@rulebook_house_rules_v1';

function isHouseRuleRecord(v: unknown): v is HouseRule {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.gameName === 'string' &&
    Array.isArray(o.rules) &&
    o.rules.every((r) => typeof r === 'string')
  );
}

function parseHouseRulesFromStorage(raw: string | null): HouseRule[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: HouseRule[] = [];
    for (const item of parsed) {
      if (!isHouseRuleRecord(item)) continue;
      const rules = item.rules.map((r) => r.trim()).filter(Boolean);
      out.push({
        id: item.id,
        gameName: item.gameName.trim(),
        rules,
      });
    }
    return out;
  } catch {
    return [];
  }
}

const RULEBOOK_CHAT_CONTEXT_CHAR_MAX = 900;
const RULEBOOK_OPENAI_USER_CHAR_MAX = 4000;
const RULEBOOK_OPENAI_ASSISTANT_CHAR_MAX = 3400;
const RULEBOOK_OPENAI_HISTORY_MAX_MESSAGES = 12;

function truncateForRulebookContext(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

/**
 * User messages + optional last assistant excerpt so GameRules.com filtering and offline
 * sentence scoring align with what was already explained (follow-ups).
 */
function buildRulesThreadContextForExtract(allMessages: Message[], question: string): string {
  const userParts = allMessages
    .filter((m) => m.isUser && m.text?.trim())
    .slice(-4)
    .map((m) => m.text!.trim());
  const base = [...userParts, question].join(' ');
  const lastAssistant = [...allMessages].reverse().find((m) => !m.isUser && m.text?.trim());
  if (!lastAssistant?.text?.trim()) return base;
  const snippet = truncateForRulebookContext(lastAssistant.text.trim(), RULEBOOK_CHAT_CONTEXT_CHAR_MAX);
  return `${base}\nPrevious reply excerpt for this thread: ${snippet}`;
}

/** Extra matching tokens/phrases for common follow-up wordings (all games). */
function expandFollowUpIntentTokens(latestQuestion: string): string[] {
  const ql = latestQuestion.toLowerCase();
  const out: string[] = [];
  if (/\bmore\s+than\s+one\b/.test(ql)) {
    out.push('multiple', 'several', 'simultaneously', 'at once', 'same time', 'pair', 'double');
  }
  if (/\b(?:a\s+)?set\s+of\s+cards?\b/.test(ql) || /\bmultiple\s+cards?\b/.test(ql)) {
    out.push('set', 'rank', 'same rank', 'cards');
  }
  if (/\bat\s+(?:a\s+)?time\b/.test(ql)) {
    out.push('turn', 'play', 'single');
  }
  if (/\bhow\s+many\b/.test(ql)) {
    out.push('number', 'count', 'each', 'per', 'total');
  }
  if (/\b(?:worth|how\s+much|points?\s+each|point\s+value|counter\s+value)\b/.test(ql)) {
    out.push('counter', 'points', 'point', 'value', 'scoring', '5s', '10s', '14', 'bird', 'rook');
  }
  if (/\b(?:who|which)\s+(?:goes|plays|starts|leads)\b/.test(ql)) {
    out.push('first', 'lead', 'dealer', 'turn', 'order');
  }
  if (/\b(?:can|could|may)\s+(?:you|i|we|they)\s+(?:still\s+)?(?:play|lay|discard|draw)\b/.test(ql)) {
    out.push('turn', 'card', 'hand', 'play');
  }
  return [...new Set(out)];
}

/** Normalize rulebot replies to short • bullets (one idea per line). */
const formatAsRulebookBullets = (raw: string, maxBullets = 6): string => {
  const lines = raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const cleaned = lines
    .map((line) =>
      line
        .replace(/^[\u2022\u25CF\u2219\s•\-\*]+/u, '')
        .replace(/^\d+[\.\)]\s*/, '')
        .trim()
    )
    .filter(Boolean);

  return cleaned.slice(0, maxBullets).map((line) => `• ${line}`).join('\n');
};

const decodeHtmlEntities = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&ldquo;|&rdquo;/gi, '"')
    .replace(/&lsquo;|&rsquo;|&#8217;/gi, "'");

const stripHtml = (html: string) =>
  decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
      .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, ' ')
      .replace(/<noscript[\s\S]*?>[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/Unsourced material may be challenged and removed\./gi, ' ')
      .replace(/\(\s*May\s*\)/gi, ' ')
      .replace(/Learn how and when to remove this message/gi, ' ')
      .replace(/\[\s*edit\s*\]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );

type GameRulesSection = { heading: string; html: string };

/** Split GameRules.com entry HTML on wp-block h2 headings. */
const splitEntryContentByH2 = (innerHtml: string): GameRulesSection[] => {
  const re = /<h2\b[^>]*>([\s\S]*?)<\/h2>/gi;
  const matches = [...innerHtml.matchAll(re)];
  if (matches.length === 0) {
    return [{ heading: '', html: innerHtml }];
  }

  const sections: GameRulesSection[] = [];
  const firstIdx = matches[0].index ?? 0;
  if (firstIdx > 0) {
    sections.push({ heading: '', html: innerHtml.slice(0, firstIdx) });
  }

  for (let i = 0; i < matches.length; i++) {
    const heading = stripHtml(matches[i][1]).replace(/\s+/g, ' ').trim();
    const contentStart = (matches[i].index ?? 0) + matches[i][0].length;
    const contentEnd =
      i + 1 < matches.length ? (matches[i + 1].index ?? innerHtml.length) : innerHtml.length;
    sections.push({ heading, html: innerHtml.slice(contentStart, contentEnd) });
  }
  return sections;
};

const sectionHeadingIsOverview = (heading: string) => /\boverview\b/i.test(heading);

const sectionHeadingIsHowToPlay = (heading: string) =>
  /\bhow\s+to\s+play\b/i.test(heading) ||
  /\bthe\s+play\s+of\b/i.test(heading) ||
  /^play\s+of\b/i.test(heading) ||
  /\bgameplay\b/i.test(heading);

const wantsGameRulesBackground = (context: string) => {
  const q = context.toLowerCase();
  return (
    /\b(history|historical|background|invented|invention|origins?\b|origin\s+of|who\s+(created|invented|made|designed)|when\s+was\s+it\s+(made|created|invented)|when\s+did\s+.+\s+come\s+out|old\s+is\s+(the\s+)?game|copyright|trademark|published\s+in\s+(the\s+)?\d{3,4})/.test(
      q
    ) ||
    /\b(tell\s+me\s+)?about\s+the\s+(history|origins?|background)/.test(q) ||
    /\bgame\s+overview\b|\boverview\s+of\s+(the\s+)?game\b|\ban\s+overview\b/.test(q) ||
    /\bwho\s+made\s+/.test(q)
  );
};

const wantsHowToPlayInstructions = (context: string) => {
  const q = context.toLowerCase();
  return (
    /\bhow\s+(do\s+i|to)\s+play\b/.test(q) ||
    /\bhow\s+do\s+you\s+play\b/.test(q) ||
    /\bteach\s+me\s+(how\s+to\s+)?play\b/.test(q) ||
    /\bexplain\s+(how\s+to\s+)?play\b/.test(q) ||
    /\bwalk\s+me\s+through\s+(how\s+to\s+)?play/.test(q) ||
    /\brules\s+for\s+playing\b/.test(q)
  );
};

const selectGameRulesSections = (
  sections: GameRulesSection[],
  threadContext: string,
  latestUserMessage: string
): GameRulesSection[] => {
  if (wantsGameRulesBackground(threadContext)) return sections;

  // Only the latest message triggers “start at How to play”; older thread text alone should not
  // (e.g. follow-up “what’s a full house?” needs scoring, not a slice from How to play only).
  if (wantsHowToPlayInstructions(latestUserMessage)) {
    const idx = sections.findIndex((s) => s.heading && sectionHeadingIsHowToPlay(s.heading));
    if (idx !== -1) return sections.slice(idx);
  }

  return sections.filter((s) => !s.heading || !sectionHeadingIsOverview(s.heading));
};

const sectionsToPlainExtract = (parts: GameRulesSection[]): string => {
  const chunks: string[] = [];
  for (const s of parts) {
    const body = stripHtml(s.html).replace(/\s+/g, ' ').trim();
    if (s.heading) {
      if (body) chunks.push(`${s.heading}. ${body}`);
      else chunks.push(s.heading);
    } else if (body) {
      chunks.push(body);
    }
  }
  return chunks.join(' ').replace(/\s+/g, ' ').trim();
};

type GameRulesCachedPage = { title: string; url: string; innerHtml: string };

const buildGameRulesExtract = (
  innerHtml: string,
  threadContext: string,
  latestUserMessage: string
): string => {
  const trimmed = innerHtml.trim();
  if (!trimmed) return '';

  const allSections = splitEntryContentByH2(trimmed);
  const finalize = (sel: GameRulesSection[]) =>
    sectionsToPlainExtract(sel)
      .replace(/\b(Read more|Leave a Comment|Subscribe)\b.*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();

  let text = finalize(selectGameRulesSections(allSections, threadContext, latestUserMessage));

  if (text.length < 60 && !wantsGameRulesBackground(threadContext)) {
    const minusOverview = allSections.filter((s) => !s.heading || !sectionHeadingIsOverview(s.heading));
    const t2 = finalize(minusOverview);
    if (t2.length > text.length) text = t2;
  }

  if (text.length < 60) {
    const t3 = finalize(allSections);
    if (t3.length > text.length) text = t3;
  }

  return text;
};

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const CROSS_GAME_SENTENCE_HINT =
  /\b(another|other)\s+(\w+\s+)?games?\b|\bcheck\s+it\s+out\b|\bgreat\s+dice-rolling\s+game\b|\bgreat\s+card\s+game\b|\bplay\s+free\s+online\b|\bbe\s+sure\s+to\s+try\b|\bbe\s+sure\s+to\s+check\b/i;

const dropLikelyCrossGameSentences = (sentences: string[], primaryLower: string): string[] => {
  if (!primaryLower || primaryLower.length < 2) return sentences;
  return sentences.filter((s) => {
    const sl = s.toLowerCase();
    if (!CROSS_GAME_SENTENCE_HINT.test(s)) return true;
    return sl.includes(primaryLower);
  });
};

/** User wants a citation / link (show GameRules.com URL only in that case). */
const userAskedForRuleSource = (question: string): boolean => {
  const q = question.toLowerCase();
  return (
    /\b(where|what).{0,24}\b(source|from|link|url|website|site)\b/i.test(q) ||
    /\b(where did you|where do you).{0,20}\b(get|find|learn|read|pull)\b/i.test(q) ||
    /\b(what('?s| is) (the|your) source|cite|citation|reference)\b/i.test(q) ||
    /\bshow (me )?(the )?link\b/i.test(q) ||
    /\bwhich site\b/i.test(q)
  );
};

export default function RulebookScreen() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useLayoutDimensions();
  const isTablet = windowWidth >= TABLET_MIN_WIDTH;
  const [activeTab, setActiveTab] = useState<Tab>('rulebook');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pastConversations, setPastConversations] = useState<RulebookSavedChat[]>([]);
  const [threadGameName, setThreadGameName] = useState<string | null>(null);
  const rulebookChatsHydratedRef = useRef(false);
  const houseRulesHydratedRef = useRef(false);
  const [houseRules, setHouseRules] = useState<HouseRule[]>([]);
  const [showAddRuleModal, setShowAddRuleModal] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [newGameName, setNewGameName] = useState('');
  const [newRules, setNewRules] = useState<string[]>(['']);
  const ruleInputRefs = useRef<(TextInputType | null)[]>([]);
  /** Avoid re-fetching the same GameRules.com article on every follow-up in a thread. */
  const gameRulesPageCacheRef = useRef(new Map<string, GameRulesCachedPage>());
  /** Last game title the user clearly asked about in this chat (for short follow-ups with no new title). */
  const rulebookThreadGameRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(RULEBOOK_CHATS_STORAGE_KEY);
        if (cancelled || !raw) return;
        const data = JSON.parse(raw) as RulebookPersistedPayload;
        if (data.draft?.messages?.length) {
          setMessages(data.draft.messages);
          const tg = data.draft.threadGame ?? null;
          rulebookThreadGameRef.current = tg;
          setThreadGameName(tg);
        }
        if (Array.isArray(data.history)) {
          setPastConversations(data.history);
        }
      } catch (e) {
        console.error('Rulebook load chats:', e);
      } finally {
        if (!cancelled) rulebookChatsHydratedRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!rulebookChatsHydratedRef.current) return;
    const payload: RulebookPersistedPayload = {
      draft: { messages, threadGame: threadGameName },
      history: pastConversations,
    };
    void AsyncStorage.setItem(RULEBOOK_CHATS_STORAGE_KEY, JSON.stringify(payload)).catch((e) =>
      console.error('Rulebook save chats:', e)
    );
  }, [messages, threadGameName, pastConversations]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(HOUSE_RULES_STORAGE_KEY);
        if (cancelled) return;
        setHouseRules(parseHouseRulesFromStorage(raw));
      } catch (e) {
        console.error('Rulebook load house rules:', e);
      } finally {
        if (!cancelled) houseRulesHydratedRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!houseRulesHydratedRef.current) return;
    void AsyncStorage.setItem(HOUSE_RULES_STORAGE_KEY, JSON.stringify(houseRules)).catch((e) =>
      console.error('Rulebook save house rules:', e)
    );
  }, [houseRules]);

  const getMimeTypeFromUri = (uri: string) => {
    const lower = uri.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    return 'image/jpeg';
  };

  const imageUriToDataUrl = async (uri: string) => {
    const mime = getMimeTypeFromUri(uri);
    const base64 = await FileSystem.readAsStringAsync(uri, {
      // expo-file-system type defs can differ; 'base64' works at runtime.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      encoding: ((FileSystem as any).EncodingType?.Base64 ?? 'base64') as any,
    });
    return `data:${mime};base64,${base64}`;
  };

  const buildHouseRulesContext = (rules: HouseRule[]) => {
    if (rules.length === 0) return 'No house rules have been added yet.';

    const lines: string[] = [];
    lines.push('House Rules (user-entered, follow these for the variant they specify):');
    for (const hr of rules) {
      lines.push('');
      lines.push(`Game: ${hr.gameName}`);
      if (hr.rules.length === 0) {
        lines.push('- (no rules)');
      } else {
        hr.rules.forEach((r, i) => lines.push(`- ${i + 1}. ${r}`));
      }
    }
    return lines.join('\n');
  };

  const buildLocalFallbackResponse = (
    question: string,
    houseRules: HouseRule[],
    forcedGameKey?: string,
    /** When offline fetch failed but we already resolved the game (e.g. user sent “Skyjo”), avoid asking them to type the name again. */
    knownLookupGameName?: string,
    /** Recent user turns so short follow-ups (“what are they worth”) still match scoring lines after “counters”. */
    allMessagesForMatch?: Message[]
  ) => {
    const q = question.toLowerCase();

    const isHowToOverview =
      /\bhow\b.*\bplay\b/i.test(question) || /\bhow to play\b/i.test(question) || /\brules\b/i.test(q);
    const questionOnly = !isHowToOverview;

    const buildQuestionTextForLineMatch = (latestQuestion: string): string => {
      const userTurns =
        allMessagesForMatch?.filter((m) => m.isUser && m.text?.trim()).map((m) => m.text!.trim()) ?? [];
      const merged = (userTurns.length ? userTurns.slice(-3).join(' ') : latestQuestion).trim();
      const extra = expandFollowUpIntentTokens(latestQuestion).join(' ');
      return `${merged} ${extra}`.trim();
    };

    const selectRelevantLines = (text: string, questionText: string) => {
      const stop = new Set([
        'what',
        'when',
        'where',
        'why',
        'how',
        'does',
        'do',
        'i',
        'you',
        'your',
        'the',
        'a',
        'an',
        'and',
        'or',
        'to',
        'for',
        'of',
        'in',
        'on',
        'with',
        'is',
        'are',
        'be',
        'make',
        'makes',
        'made',
        'from',
        'then',
        'next',
        'about',
        'into',
        'that',
        'this',
        'it',
        'its',
        'they',
        'them',
        'their',
        'those',
        'these',
      ]);

      const keywords = questionText
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .map((w) => w.trim())
        .filter(Boolean)
        .filter((w) => {
          if (stop.has(w)) return false;
          if (w.length >= 3) return true;
          if (/^\d+s?$/i.test(w)) return true;
          return false;
        });

      const lines = text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);

      const relevant = lines.filter((line) =>
        keywords.some((k) => line.toLowerCase().includes(k))
      );

      // If we found nothing, just keep the first few lines (still short).
      const final = relevant.length ? relevant : lines;
      return final.slice(0, 4).join('\n');
    };

    const GAME_KEYS: { key: string; aliases: string[] }[] = [
      { key: 'mexican-train', aliases: ['mexican train', 'mexican'] },
      { key: 'yahtzee', aliases: ['yahtzee'] },
      { key: 'wizard', aliases: ['wizard'] },
      { key: 'clue', aliases: ['clue', 'cluedo'] },
      { key: 'scrabble', aliases: ['scrabble'] },
      { key: 'five-crowns', aliases: ['five crowns', 'crowns', '5 crowns'] },
      { key: 'hand-and-foot', aliases: ['hand and foot', 'hand & foot', 'hand-and-foot', 'handfoot'] },
      { key: 'rook', aliases: ['rook'] },
    ];

    const STANDARD_RULES: Record<string, string> = {
      'mexican-train': [
        'Mexican Train (Dominoes) - simplified rules',
        'Goal: typically score by totaling the pips left in your hand when a round ends (lower is better).',
        'Play: on your turn, play a domino that matches the open ends of the train you’re allowed to use.',
        'If you can’t play, you draw from the boneyard until you can (or you pass if none available).',
        'The “Mexican Train” is a public chain. Each player usually has a private train; certain events open/allow play.',
        'If you describe your exact situation (what you have / what ends are showing / which train is open), I can apply the rules and your scoring sheet conventions.',
      ].join('\n'),
      yahtzee: [
        'Yahtzee - simplified rules',
        'Roll 5 dice. You may roll up to 3 times per turn to build a hand for one category.',
        'Each category can be used once. Choose the category that best scores based on your dice.',
        'Special: a Yahtzee (all 5 dice the same) scores in the YAHTZEE category; the Yahtzee bonus is based on repeated Yahtzees (use your house-rule checkboxes if you have them).',
        'If you tell me your dice results and what categories are still open, I can suggest the best placement.',
      ].join('\n'),
      wizard: [
        'Wizard - simplified rules',
        'Wizard is a bidding/trick-taking style game.',
        'Key idea: players (starting with the dealer) bid “how many tricks” they will win, then play to try to take that many.',
        'Your score sheet’s dealer circle and “bid vs made” columns represent the bidding outcome for each round.',
        'If you tell me the dealer, bids, and which player actually won how many tricks, I can help you fill the score sheet correctly (and apply any house rules you added).',
      ].join('\n'),
      clue: [
        'Clue - simplified rules',
        'Goal: use deduction to determine the 3 cards: suspect, weapon, and room.',
        'Play: make suggestions. Other players show matching cards if they can.',
        'Each time you get info, mark off possibilities. When you have a confident set, make an accusation.',
      ].join('\n'),
      scrabble: [
        'Scrabble - simplified rules',
        'Goal: score the most points by building crossword-style words on a grid.',
        'Turn: you place tiles to form a valid word connected to existing tiles.',
        'Scoring: you earn points from tile values + word multipliers/letter multipliers.',
        'At the end, your total is the sum of all turns, adjusted by remaining “unplayed tiles” rules your group uses.',
      ].join('\n'),
      'five-crowns': [
        'Five Crowns - simplified rules',
        'Goal: get rid of your cards by making melds (sets/runs) and end with the lowest points.',
        'Melds (sets and runs):',
        'Set: the same number, in different colors.',
        'Run: the same color, in a number sequence.',
        'Wild cards can fill in for a missing card.',
        'Each card has a point value; points for the round are based on cards left in hand.',
        'If you tell me what melds you formed (or what you’re holding) I can help calculate your scoring and what you should do next.',
      ].join('\n'),
      'hand-and-foot': [
        'Hand & Foot - simple rules',
        'Goal: make melds (sets) and “go out” by using your last card.',
        'Each player has 2 piles: a Hand (face up) and a Foot (face down).',
        'Books (melds): put 3 to 7 cards of the same rank on the table.',
        'When a meld reaches 7 cards, it becomes a Book.',
        'Clean vs Dirty: some Books have no wild cards (Clean). Others use wild cards (Dirty).',
        'To go out, finish your Hand, then deal with the Foot rules your group uses.',
        'Tell me your round (1-4) and what cards you need. I can help you place cards and plan your move.',
      ].join('\n'),
      rook: [
        'Rook - simple rules',
        'Rook is a trick game with 2 teams (2 players each).',
        'Pick a trump suit (the trump beats other suits).',
        'On your turn, play a card following the suit if you can.',
        'The highest trump wins the trick.',
        'The Rook Bird is the strongest trump card.',
        'After the hand, teams count the point cards they won.',
        ROOK_EDITION_LINE,
        'Teams win by reaching the target score (example: 300) before the other team.',
      ].join('\n'),
    };

    const pickedGame =
      forcedGameKey ??
      GAME_KEYS.find((g) => g.aliases.some((a) => q.includes(a)))?.key;

    if (pickedGame) {
      const standardGameNameByKey: Record<string, string> = {
        'mexican-train': 'Mexican Train',
        yahtzee: 'Yahtzee',
        wizard: 'Wizard',
        clue: 'Clue',
        scrabble: 'Scrabble',
        'five-crowns': 'Five Crowns',
        'hand-and-foot': 'Hand & Foot',
        rook: 'Rook',
      };

      const standardName = standardGameNameByKey[pickedGame] ?? '';
      const matchingHouse = forcedGameKey
        ? houseRules.filter((hr) => {
          const hrName = hr.gameName.toLowerCase();
          const standardLower = standardName.toLowerCase();
          return (
            (standardLower && hrName.includes(standardLower)) ||
            (standardLower && standardLower.includes(hrName))
          );
        })
        : houseRules.filter((hr) => q.includes(hr.gameName.toLowerCase()));
      let standard = STANDARD_RULES[pickedGame] || '';
      if (pickedGame === 'rook' && questionOnly && looksLikeRookScoringQuestion(q)) {
        standard = standard.replace(ROOK_EDITION_LINE, ROOK_SCORING_REFERENCE);
      }

      const shortAnswer = questionOnly && looksLikeShortAnswerFragment(question);
      const pool = shortAnswer ? stripTellMeCoachLines(standard) : standard;
      const selectionPool = pool.trim().length > 0 ? pool : standard;

      if (matchingHouse.length > 0) {
        const houseSection = [
          '',
          `Your house rules (${matchingHouse[0].gameName}):`,
          ...matchingHouse.flatMap((hr) => hr.rules.map((r, i) => `${i + 1}. ${r}`)),
          '',
          'When there’s a conflict, use your house rules instead of standard rules.',
        ].join('\n');

        if (!questionOnly) {
          return formatAsRulebookBullets(`${standard}${houseSection}`, 8);
        }

        const relevantStandard = selectRelevantLines(selectionPool, buildQuestionTextForLineMatch(question));
        // For follow-ups, only include the most relevant house rule lines.
        const relevantHouseRules = houseSection
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
          .filter((l) =>
            q.split(/\s+/).some((word) => word.length >= 3 && l.toLowerCase().includes(word))
          )
          .slice(0, 3)
          .join('\n');

        const ackLine = shortAnswer
          ? shortAnswerAcknowledgmentLine(question, pickedGame, standardName)
          : '';

        return formatAsRulebookBullets(
          [ackLine, relevantStandard, relevantHouseRules].filter(Boolean).join('\n'),
          7
        );
      }

      if (!questionOnly) return formatAsRulebookBullets(standard, 8);
      const ackLine = shortAnswer
        ? shortAnswerAcknowledgmentLine(question, pickedGame, standardName)
        : '';
      const relevantStandard = selectRelevantLines(selectionPool, buildQuestionTextForLineMatch(question));
      return formatAsRulebookBullets(
        [ackLine, relevantStandard].filter(Boolean).join('\n'),
        shortAnswer ? 7 : 5
      );
    }

    // If they included a game name that doesn’t match our known alias list, fall back to showing the
    // house rules for that named game.
    const matching = houseRules.find((hr) => {
      const hn = hr.gameName.toLowerCase();
      if (hn.length <= 3) return q.includes(hn);
      return new RegExp(`\\b${escapeRegExp(hn)}\\b`, 'i').test(q);
    });
    if (matching) {
      return formatAsRulebookBullets(
        [
          `House rules for ${matching.gameName}:`,
          ...matching.rules.map((r) => r),
          '',
          'Say what happened (roll, card, turn) and I can help apply them.',
        ].join('\n'),
        8
      );
    }

    // Generic help message: without an AI model/key we can only reliably answer
    // either (a) games we have standard rules for above, or (b) games where you
    // entered House Rules in this app.
    const known = knownLookupGameName?.trim();
    if (known && known.length >= 2) {
      return formatAsRulebookBullets(
        [
          `I couldn’t find a rules page for ${known} just now.`,
          `Add House Rules for ${known} in this app so I can answer using how your group plays.`,
        ].join('\n'),
        5
      );
    }
    return formatAsRulebookBullets(
      [
        'Name the game you mean (for example “Skyjo” or “How do I play Skyjo?”).',
        'Or add House Rules in this app for that game so answers match your table.',
      ].join('\n'),
      5
    );
  };

  const extractGameNameFromQuestion = (question: string): string => {
    const q = question.trim();

    const patterns: RegExp[] = [
      /(?:how to play|how do i play)\s+(.+?)(?:\?|$)/i,
      /(?:rules for|rule for|rules)\s+(.+?)(?:\?|$)/i,
      /\bplay\s+(.+?)(?:\?|$)/i,
      /^([^:?.]{1,60}):\s*/i,
    ];

    for (const p of patterns) {
      const m = q.match(p);
      if (m && m[1]) {
        const chunk = m[1].trim().replace(/\s+rules$/i, '').trim();
        if (chunk.length >= 2 && chunk.length <= 60) return chunk;
      }
    }

    const stripped = q.replace(/^[?\s]+|[?\s]+$/g, '').trim();
    const words = stripped.split(/\s+/).filter(Boolean);
    if (words.length === 0 || words.length > 4) return '';

    const looksLikeQuestionOrRuleFragment =
      /^(how|what|when|where|why|who|which|tell|explain|describe|give|show|say|can|could|would|should|is|are|was|were|does|do|did|has|have|had)\b/i.test(
        stripped
      ) ||
      /\b(objective|scoring|score|bonus|the same|still|again|here|there|this|that|these|those|players?|dice|cards?|round|turn|points?|full house|straight|joker)\b/i.test(
        stripped
      );

    if (looksLikeQuestionOrRuleFragment) return '';

    return stripped.replace(/\s+rules$/i, '').trim();
  };

  const inferStandardGameKeyFromName = (name: string): string | null => {
    const lower = name.toLowerCase();
    if (lower.includes('mexican')) return 'mexican-train';
    if (lower.includes('yahtzee')) return 'yahtzee';
    if (lower.includes('wizard')) return 'wizard';
    if (lower.includes('clue')) return 'clue';
    if (lower.includes('scrabble')) return 'scrabble';
    if (lower.includes('five')) return 'five-crowns';
    if (lower.includes('hand') && lower.includes('foot')) return 'hand-and-foot';
    if (lower.includes('rook')) return 'rook';
    return null;
  };

  const RULE_QUESTION_STOP_WORDS = new Set([
    'what',
    'when',
    'where',
    'why',
    'how',
    'does',
    'do',
    'did',
    'i',
    'you',
    'your',
    'the',
    'a',
    'an',
    'and',
    'or',
    'to',
    'for',
    'of',
    'in',
    'on',
    'with',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'being',
    'make',
    'makes',
    'made',
    'then',
    'next',
    'if',
    'it',
    'its',
    'we',
    'they',
    'them',
    'this',
    'that',
    'these',
    'those',
    'can',
    'could',
    'would',
    'should',
    'one',
    'two',
    'about',
    'just',
    'get',
    'got',
    'any',
    'some',
    'there',
    'here',
    'from',
    'into',
    'out',
    'up',
    'so',
    'as',
    'at',
    'by',
    'not',
    'no',
    'yes',
    'who',
    'which',
  ]);

  const tokenizeRuleQuestion = (q: string): string[] => [
    ...new Set(
      q
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .map((w) => w.trim())
        .filter(Boolean)
        .filter((w) => w.length >= 3 && !RULE_QUESTION_STOP_WORDS.has(w))
    ),
  ];

  const WEAK_RULE_MATCH_TOKENS = new Set(['more', 'time', 'than', 'same', 'just', 'only']);

  const scoreSentenceForRuleTokens = (sentence: string, tokens: string[], isFollowUp: boolean): number => {
    if (tokens.length === 0) return 0;
    const sl = sentence.toLowerCase();
    let score = 0;
    for (const t of tokens) {
      if (!sl.includes(t)) continue;
      let w = Math.min(12, Math.max(3, t.length));
      if (isFollowUp && WEAK_RULE_MATCH_TOKENS.has(t)) w *= 0.35;
      score += w;
    }
    return score;
  };

  const stemifyRuleTokens = (tokens: string[]): string[] => {
    const stems = new Set<string>();
    for (const t of tokens) {
      stems.add(t);
      if (t.endsWith('ing') && t.length > 5) stems.add(t.slice(0, -3));
      if (t.endsWith('es') && t.length > 4) stems.add(t.slice(0, -2));
      if (t.endsWith('s') && t.length > 4) stems.add(t.slice(0, -1));
    }
    return [...stems].filter((s) => s.length >= 3);
  };

  /**
   * First question: match any token (and stems). Follow-up: rank by the *latest* question’s tokens
   * so earlier turns (e.g. “how to play X”) don’t drown out “joker” / “full house”.
   */
  const selectSentencesMatchingQuestion = (
    sentences: string[],
    latestQuestion: string,
    lookupGameLower: string,
    allUserTextsChronological: string[],
    isFollowUp: boolean
  ): string[] => {
    const sl = (s: string) => s.toLowerCase();
    const matchAny = (s: string, toks: string[]) => toks.some((t) => sl(s).includes(t));

    let tokens = tokenizeRuleQuestion(latestQuestion);
    if (isFollowUp) {
      tokens = [...new Set([...tokens, ...expandFollowUpIntentTokens(latestQuestion)])];
    }
    if (isFollowUp && lookupGameLower.length >= 3) {
      const gameParts = lookupGameLower
        .split(/[^a-z0-9]+/i)
        .map((w) => w.trim().toLowerCase())
        .filter((w) => w.length >= 3 && !RULE_QUESTION_STOP_WORDS.has(w));
      tokens = [...new Set([...gameParts, ...tokens])];
    }
    if (tokens.length === 0 && isFollowUp && allUserTextsChronological.length >= 1) {
      tokens = tokenizeRuleQuestion(
        [...allUserTextsChronological.slice(-2), latestQuestion].join(' ')
      );
    }
    if (tokens.length === 0) return sentences;

    if (isFollowUp) {
      const scored = sentences
        .map((s) => ({ s, sc: scoreSentenceForRuleTokens(s, tokens, true) }))
        .filter((x) => x.sc > 0)
        .sort((a, b) => b.sc - a.sc);
      if (scored.length > 0) {
        return scored.slice(0, 7).map((x) => x.s);
      }
      const stemArr = stemifyRuleTokens(tokens);
      const stemmed = sentences.filter((s) => matchAny(s, stemArr));
      return stemmed.length > 0 ? stemmed.slice(0, 9) : sentences.slice(0, 8);
    }

    const direct = sentences.filter((s) => matchAny(s, tokens));
    if (direct.length > 0) return direct;
    const stemArr = stemifyRuleTokens(tokens);
    const stemmed = sentences.filter((s) => matchAny(s, stemArr));
    return stemmed.length > 0 ? stemmed : sentences;
  };

  /** Walk nested divs after `<div class="entry-content"…>` to get main article HTML. */
  const extractEntryContentInnerHtml = (fullHtml: string): string => {
    const lower = fullHtml.toLowerCase();
    const marker = 'class="entry-content"';
    const idx = lower.indexOf(marker);
    if (idx === -1) return '';
    const gt = fullHtml.indexOf('>', idx);
    if (gt === -1) return '';
    let pos = gt + 1;
    let depth = 1;
    while (pos < fullHtml.length && depth > 0) {
      const open = lower.indexOf('<div', pos);
      const close = lower.indexOf('</div>', pos);
      if (close === -1) break;
      if (open !== -1 && open < close) {
        depth += 1;
        pos = open + 4;
      } else {
        depth -= 1;
        if (depth === 0) return fullHtml.slice(gt + 1, close);
        pos = close + 6;
      }
    }
    return '';
  };

  const searchGameRulesRuleUrls = async (searchQuery: string): Promise<string[]> => {
    try {
      const q = searchQuery.trim();
      if (!q) return [];
      const searchUrl = `${GAMERULES_ORIGIN}/?s=${encodeURIComponent(q)}`;
      const html = await fetchGamerulesHtml(searchUrl);
      if (!html) return [];
      const seen = new Set<string>();
      const out: string[] = [];
      const add = (raw: string) => {
        const u = raw.replace(/\/$/, '');
        if (!seen.has(u)) {
          seen.add(u);
          out.push(u);
        }
      };
      let m: RegExpExecArray | null;
      const abs = /href=["'](https:\/\/gamerules\.com\/rules\/[^"'\s#]+)["']/gi;
      while ((m = abs.exec(html)) !== null) add(m[1]);
      const rel = /href=["'](\/rules\/[^"'\s#]+)["']/gi;
      while ((m = rel.exec(html)) !== null) add(`${GAMERULES_ORIGIN}${m[1]}`);
      return out;
    } catch {
      return [];
    }
  };

  const pickBestGameRulesUrl = (urls: string[], gameName: string): string | null => {
    if (urls.length === 0) return null;
    const key = gameName.toLowerCase().trim();
    const alias = GAMERULES_GAME_ALIASES[key];
    const extra = alias?.slugKeywords ?? [];
    const tokens = [
      ...gameName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length >= 2),
      ...extra,
    ];
    if (tokens.length === 0) return urls[0];
    let best = urls[0];
    let bestScore = -1;
    for (const u of urls) {
      const slug = (u.split('/').filter(Boolean).pop() ?? '').toLowerCase();
      let score = 0;
      for (const t of tokens) {
        if (t.length >= 2 && slug.includes(t)) score += 3;
      }
      if (score > bestScore) {
        bestScore = score;
        best = u;
      }
    }
    return bestScore > 0 ? best : urls[0];
  };

  const fetchGameRulesArticlePage = async (pageUrl: string): Promise<GameRulesCachedPage | null> => {
    try {
      const html = await fetchGamerulesHtml(pageUrl);
      if (!html) return null;
      const titleMatch = html.match(/<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i);
      let title = titleMatch
        ? stripHtml(titleMatch[1]).trim()
        : pageUrl.split('/').filter(Boolean).pop()?.replace(/-/g, ' ') ?? 'Game rules';
      if (!title) title = 'Game rules';

      let inner = extractEntryContentInnerHtml(html);
      const authorCut = inner.search(/<div[^>]*class="[^"]*abh_box/i);
      if (authorCut !== -1) inner = inner.slice(0, authorCut);

      const plainLen = stripHtml(inner).replace(/\s+/g, ' ').trim().length;
      if (!inner || plainLen < 60) return null;
      return { title, innerHtml: inner, url: pageUrl };
    } catch {
      return null;
    }
  };

  const fetchGameRulesComOverview = async (gameName: string): Promise<GameRulesCachedPage | null> => {
    const key = gameName.trim().toLowerCase();
    const alias = GAMERULES_GAME_ALIASES[key];
    const extraQueries = alias?.queries ?? [];
    const queries = [
      ...new Set(
        [gameName, `${gameName} rules`, `${gameName} card game`, ...extraQueries].map((s) => s.trim())
      ),
    ].filter((s) => s.length >= 2);
    for (const q of queries.slice(0, 8)) {
      // eslint-disable-next-line no-await-in-loop
      const urls = await searchGameRulesRuleUrls(q);
      if (urls.length === 0) continue;
      const best = pickBestGameRulesUrl(urls, gameName);
      if (!best) continue;
      // eslint-disable-next-line no-await-in-loop
      const page = await fetchGameRulesArticlePage(best);
      if (page && stripHtml(page.innerHtml).replace(/\s+/g, ' ').trim().length >= 60) {
        return page;
      }
    }

    // Search pages can occasionally miss obvious matches. Try direct /rules/<slug> URLs.
    const slugCandidates = new Set<string>();
    const addSlug = (s: string) => {
      const slug = s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .trim();
      if (slug.length >= 2) slugCandidates.add(slug);
    };
    addSlug(gameName);
    const inferredBare = extractGameNameFromQuestion(gameName);
    if (inferredBare) addSlug(inferredBare);
    const cleaned = gameName
      .toLowerCase()
      .replace(/\b(how\s+do\s+i\s+play|how\s+to\s+play|rules?\s+for|rules?)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned) addSlug(cleaned);
    const words = cleaned.split(/\s+/).filter(Boolean);
    if (words.length >= 1) addSlug(words[words.length - 1]);

    for (const slug of slugCandidates) {
      const directUrl = `${GAMERULES_ORIGIN}/rules/${slug}`;
      // eslint-disable-next-line no-await-in-loop
      const direct = await fetchGameRulesArticlePage(directUrl);
      if (direct && stripHtml(direct.innerHtml).replace(/\s+/g, ' ').trim().length >= 60) {
        return direct;
      }
    }
    return null;
  };

  const resolveLookupGameName = (question: string, allMessages: Message[] | undefined): string | null => {
    const userTurnCount = allMessages?.filter((m) => m.isUser && m.text?.trim()).length ?? 0;

    /** User is clearly naming which game—otherwise follow-ups stay on the thread’s last game. */
    const hasExplicitNewGameTitle = (text: string): boolean => {
      const q = text.trim();
      if (!q) return false;
      const lower = q.toLowerCase();

      const m1 = q.match(/\bhow\s+(?:do\s+i|to)\s+play\s+(.+?)(?:\?|$)/i);
      if (m1) {
        const tail = m1[1].trim();
        if (
          tail.length >= 2 &&
          !/^(with|when|if|unless|without|using|after|before|the|a|an|this|that|it|these|those)\b/i.test(
            tail
          )
        ) {
          return true;
        }
      }

      if (/\brules\s+(?:for|of)\s+(?!the\b|a\b|an\b)[a-z0-9]/i.test(lower)) return true;

      const wa = q.match(/\bwhat\s+about\s+(.+?)(?:\?|$)/i);
      if (wa) {
        const frag = wa[1].trim();
        if (!/^(the|a|an)\s+/i.test(frag) && frag.split(/\s+/).length <= 4 && frag.length >= 2) {
          if (
            !/\b(scoring|bonus|rules?|objective|joker|round|turn|same|players?|dice|cards?|when|where|why)\b/i.test(
              frag.toLowerCase()
            )
          ) {
            return true;
          }
        }
      }

      const bare = extractGameNameFromQuestion(q);
      if (bare.length >= 2 && q.replace(/\?+$/, '').trim().toLowerCase() === bare.toLowerCase()) {
        return true;
      }

      return false;
    };

    const inferGameName = (text: string): string | null => {
      const lower = text.toLowerCase();

      const mentionedHouse = houseRules.find((hr) => {
        const hn = hr.gameName.toLowerCase();
        if (hn.length <= 3) return lower.includes(hn);
        return new RegExp(`\\b${escapeRegExp(hn)}\\b`, 'i').test(text);
      });
      if (mentionedHouse) return mentionedHouse.gameName;

      const whatAbout = text.match(/\bwhat\s+about\s+(.+?)(?:\?|$)/i);
      if (whatAbout) {
        const frag = whatAbout[1].trim();
        if (!/^(the|a|an)\s+/i.test(frag) && frag.split(/\s+/).length <= 4 && frag.length >= 2) {
          if (
            !/\b(scoring|bonus|rules?|objective|joker|round|turn|same|players?|dice|cards?)\b/i.test(
              frag.toLowerCase()
            )
          ) {
            return frag;
          }
        }
      }

      const CANONICAL_ALIASES: { canonical: string; patterns: string[] }[] = [
        { canonical: 'mexican train', patterns: ['mexican train', 'mexican'] },
        { canonical: 'yahtzee', patterns: ['yahtzee'] },
        { canonical: 'wizard', patterns: ['wizard'] },
        { canonical: 'clue', patterns: ['cluedo', 'clue'] },
        { canonical: 'scrabble', patterns: ['scrabble'] },
        { canonical: 'five crowns', patterns: ['five crowns', '5 crowns', 'crowns'] },
      ];

      for (const { canonical, patterns } of CANONICAL_ALIASES) {
        for (const pat of [...patterns].sort((a, b) => b.length - a.length)) {
          if (new RegExp(`\\b${escapeRegExp(pat)}\\b`, 'i').test(lower)) return canonical;
        }
      }

      const extracted = extractGameNameFromQuestion(text).trim();
      const firstLine = extracted.split(/[\n\r]+/)[0].trim();

      if (
        /\b(how|what|when|where|why|who|which|tell|explain|describe|give|show|say|can i|could i|would i)\b/i.test(
          firstLine
        ) ||
        /\b(?:is|are|does|do|did|was|were|has|have|had)\b/i.test(firstLine)
      ) {
        return null;
      }

      const wordCount = firstLine.split(/\s+/).filter(Boolean).length;
      if (wordCount > 4) return null;

      const cleaned = firstLine
        .replace(/^rules for\s+/i, '')
        .replace(/^how to play\s+/i, '')
        .replace(/^how do i play\s+/i, '')
        .replace(/^play\s+/i, '')
        .replace(/\s+game\s+rules$/i, '')
        .replace(/\s+game$/i, '')
        .replace(/\s+rules$/i, '')
        .trim();

      return cleaned.length >= 2 ? cleaned : null;
    };

    const assignThreadGame = (name: string) => {
      const t = name.trim();
      if (t.length >= 2) {
        rulebookThreadGameRef.current = t;
        setThreadGameName(t);
      }
      return t;
    };

    if (userTurnCount >= 2 && rulebookThreadGameRef.current) {
      if (hasExplicitNewGameTitle(question)) {
        const hit = inferGameName(question);
        if (hit) return assignThreadGame(hit);
      }
      return rulebookThreadGameRef.current;
    }

    if (hasExplicitNewGameTitle(question)) {
      const hit = inferGameName(question);
      if (hit) return assignThreadGame(hit);
    }

    const fromCurrent = inferGameName(question);
    if (fromCurrent) return assignThreadGame(fromCurrent);

    const userMsgs = allMessages?.filter((m) => m.isUser && m.text?.trim()) ?? [];
    for (let i = userMsgs.length - 2; i >= 0; i -= 1) {
      const inferred = inferGameName(userMsgs[i].text!);
      if (inferred) return assignThreadGame(inferred);
    }
    return null;
  };

  const getOfflineAnswer = async (
    question: string,
    imageUri?: string | null,
    allMessages?: Message[]
  ) => {
    const q = question.toLowerCase();

    // 1) If user mentioned a game name that matches a house-rule entry, use those.
    const mentionedHouseRule = houseRules.some((hr) => {
      const hn = hr.gameName.toLowerCase();
      if (hn.length <= 3) return q.includes(hn);
      return new RegExp(`\\b${escapeRegExp(hn)}\\b`, 'i').test(q);
    });
    if (mentionedHouseRule) {
      return buildLocalFallbackResponse(question, houseRules, undefined, undefined, allMessages);
    }

    // 2) If we have built-in simplified rules for the game, use those.
    const GAME_KEYS: { key: string; aliases: string[] }[] = [
      { key: 'mexican-train', aliases: ['mexican train', 'mexican'] },
      { key: 'yahtzee', aliases: ['yahtzee'] },
      { key: 'wizard', aliases: ['wizard'] },
      { key: 'clue', aliases: ['clue', 'cluedo'] },
      { key: 'scrabble', aliases: ['scrabble'] },
      { key: 'five-crowns', aliases: ['five crowns', 'crowns', '5 crowns'] },
    ];
    const pickedGame = GAME_KEYS.find((g) =>
      g.aliases.some((a) => new RegExp(`\\b${escapeRegExp(a)}\\b`, 'i').test(q))
    )?.key;
    if (pickedGame) {
      return buildLocalFallbackResponse(question, houseRules, undefined, undefined, allMessages);
    }

    // 3) Infer game from this message or earlier user turns (follow-ups).
    const lookupGameName = resolveLookupGameName(question, allMessages);

    if (!lookupGameName) {
      return buildLocalFallbackResponse(question, houseRules, undefined, undefined, allMessages);
    }

    // Built-in games: local summaries (including on follow-ups).
    const forcedGameKey = inferStandardGameKeyFromName(lookupGameName);
    if (forcedGameKey) {
      return buildLocalFallbackResponse(question, houseRules, forcedGameKey, undefined, allMessages);
    }

    // GameRules.com: cache by normalized game lookup string.
    const cacheKey = lookupGameName.trim().toLowerCase();
    let gr = gameRulesPageCacheRef.current.get(cacheKey) ?? null;
    if (!gr) {
      gr = await fetchGameRulesComOverview(lookupGameName);
      if (gr) gameRulesPageCacheRef.current.set(cacheKey, gr);
    }

    const allUserTextsChronological =
      allMessages?.filter((m) => m.isUser && m.text?.trim()).map((m) => m.text!.trim()) ?? [];
    const isFollowUpOffline = allUserTextsChronological.length >= 2;
    const questionContext = buildRulesThreadContextForExtract(allMessages ?? [], question);
    const extract =
      gr && gr.innerHtml.trim().length > 0
        ? buildGameRulesExtract(gr.innerHtml, questionContext, question)
        : '';

    if (gr && extract.trim().length > 0) {
      const imageHint = imageUri
        ? '\n\nAlso, I see you added a picture—if the picture includes variant text, tell me what it says and I’ll tailor the answer.'
        : '';

      const INSTRUCTION_KEYWORDS = [
        'mat',
        'players',
        'player',
        'turn',
        'spin',
        'hand',
        'hands',
        'place',
        'placing',
        'placed',
        'bid',
        'trick',
        'deck',
        'card',
        'cards',
        'command',
        'foot',
        'feet',
        'move',
        'position',
        'positions',
        'rules',
        'score',
        'points',
        'objective',
        'deal',
        'win',
        'goal',
        'gameplay',
      ];

      const isInstructionSentence = (s: string) =>
        INSTRUCTION_KEYWORDS.some((k) => s.toLowerCase().includes(k));

      const metadataSentenceRegex =
        /(invented|created|made by|produced by|manufactured by|published by|producer|produced|publisher|designer|manufacturer|released|trademark|year|first|hasbro|milton|bradley|mattel|spinmaster|boardgamegeek|parker brothers)/i;
      const yearRegex = /\b(19|20)\d{2}\b/g;

      const cleanedSentences = extract
        .replace(/\s+/g, ' ')
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
          let cleaned = s.replace(yearRegex, '').trim();

          if (metadataSentenceRegex.test(cleaned) && isInstructionSentence(cleaned)) {
            cleaned = cleaned.replace(
              /\b(made by|created by|invented by|produced by|manufactured by|published by|trademarked by)\b\s+[^.]*?(?=\b(played|on|mat|players|hands|feet|spin|each|turn|move|position|rules|goal|deal|bid|trick|card)\b)/i,
              ''
            );
          }

          cleaned = cleaned.replace(
            /\b(Hasbro|Milton Bradley|Milton|Bradley|Mattel|Spin Master|Parker Brothers)\b/gi,
            ''
          );

          cleaned = cleaned.replace(
            /\b(produced by|manufactured by|published by|trademarked by)\b\s+[^,;—]+/gi,
            ''
          );

          cleaned = cleaned.replace(/\s{2,}/g, ' ').replace(/\s+,/g, ',').replace(/,\s*,/g, ',');

          return cleaned.replace(/\s{2,}/g, ' ').trim();
        })
        .filter((s) => s.trim().length > 0);

      const withoutCross =
        lookupGameName.trim().length > 0
          ? dropLikelyCrossGameSentences(cleanedSentences, lookupGameName.trim().toLowerCase())
          : cleanedSentences;
      const baseSentences = withoutCross.length > 0 ? withoutCross : cleanedSentences;

      const selectedSentences = selectSentencesMatchingQuestion(
        baseSentences,
        question,
        lookupGameName.trim().toLowerCase(),
        allUserTextsChronological,
        isFollowUpOffline
      );
      const usedFollowUpFocus =
        isFollowUpOffline ||
        (selectedSentences.join('\0') !== baseSentences.join('\0') && selectedSentences.length > 0);

      const MAX_CHARS = isFollowUpOffline ? 560 : usedFollowUpFocus ? 900 : 650;
      const joinedSelected = selectedSentences.join(' ');
      const fullText = joinedSelected.trim().length ? joinedSelected : extract.replace(/\s+/g, ' ').trim();

      const sentsForBullets =
        selectedSentences.length > 0
          ? selectedSentences
          : fullText.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);

      let bulletBody = formatAsRulebookBullets(
        sentsForBullets.join('\n'),
        isFollowUpOffline ? 4 : 6
      );
      if (bulletBody.length > MAX_CHARS) {
        bulletBody = bulletBody.slice(0, MAX_CHARS).replace(/\s+\S*$/, '').trim();
        const cut = bulletBody.lastIndexOf('\n• ');
        if (cut > 60) bulletBody = bulletBody.slice(0, cut).trim();
      }

      const parts = [bulletBody];
      if (gr.url && userAskedForRuleSource(question)) parts.push(`(Source: ${gr.url})`);
      if (imageHint) parts.push(imageHint);
      return parts.join('\n\n');
    }

    // 4) Final fallback (no AI key): tell the user what we can do.
    return buildLocalFallbackResponse(question, houseRules, undefined, lookupGameName, allMessages);
  };

  const getOpenAIResponse = async ({
    question,
    imageUri,
    allMessages,
    houseRules,
  }: {
    question: string;
    imageUri?: string | null;
    allMessages: Message[];
    houseRules: HouseRule[];
  }) => {
    const lookupGameName = resolveLookupGameName(question, allMessages);
    const llmUserTurnCount = allMessages.filter((m) => m.isUser && m.text?.trim()).length;
    const isFollowUpThread = llmUserTurnCount >= 2;
    const rulesQuestionContext = buildRulesThreadContextForExtract(allMessages, question);

    let gameRulesReferenceBlock = '';
    if (lookupGameName && !inferStandardGameKeyFromName(lookupGameName)) {
      const cacheKey = lookupGameName.trim().toLowerCase();
      let grPage = gameRulesPageCacheRef.current.get(cacheKey) ?? null;
      if (!grPage) {
        grPage = await fetchGameRulesComOverview(lookupGameName);
        if (grPage) gameRulesPageCacheRef.current.set(cacheKey, grPage);
      }
      if (grPage?.innerHtml?.trim()) {
        const oneLine = buildGameRulesExtract(grPage.innerHtml, rulesQuestionContext, question).replace(
          /\s+/g,
          ' '
        ).trim();
        const cap = 3200;
        gameRulesReferenceBlock = [
          '---',
          `Rule reference for this thread: “${grPage.title}”. Use for factual answers and follow-ups about the same game.`,
          'Reference text is section-filtered: Overview/intro is omitted unless the user asked for history, background, or an overview. “How to play” questions start at the How to Play section of the reference.',
          oneLine.length > cap ? `${oneLine.slice(0, cap)}…` : oneLine,
          `Prefer sentences that match the user’s latest message (follow-up: ${isFollowUpThread ? 'yes' : 'no'}). Ignore unrelated sections. House rules override conflicts.`,
          `Do not include URLs, “Source:”, or website names in your answer unless the user asked where the information came from; then give one short bullet with: ${grPage.url}`,
          '---',
        ].join('\n');
      }
    }

    const threadGameWithoutExcerpt =
      lookupGameName &&
      lookupGameName.trim().length >= 2 &&
      !inferStandardGameKeyFromName(lookupGameName) &&
      !gameRulesReferenceBlock.trim()
        ? `Thread game: ${lookupGameName.trim()}. No rule article was loaded (offline, blocked request, or no matching page). Answer from general knowledge; say variants may differ. If the user only sent the game name, give a short how-to-play overview.`
        : '';

    const isHowToOverview =
      /\bhow\b.*\bplay\b/i.test(question) || /\bhow to play\b/i.test(question) || /\brules\b/i.test(question);
    const questionOnly =
      isFollowUpThread ||
      !isHowToOverview;

    const postProcessAiText = (text: string) => {
      let t = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

      if (!userAskedForRuleSource(question)) {
        t = t
          .replace(/\n\s*•\s*\(?\s*source\s*:\s*https?:\/\/[^\n]+/gi, '\n')
          .replace(/\n\s*\(?\s*source\s*:\s*https?:\/\/[^\n)]+/gi, '\n')
          .replace(/\n\s*•\s*https?:\/\/gamerules\.com[^\n]*/gi, '\n')
          .replace(/\s*source\s*:\s*https?:\/\/[^\n]+$/gim, '')
          .trim();
      }

      // Remove common leading filler.
      t = t
        .replace(
          /^(sure|of course|here('?s| is| are)?|okay|alright)[^a-zA-Z0-9]*?/i,
          ''
        )
        .trim();

      const replacements: Array<[RegExp, string]> = [
        [/^\s*Gameplay\b\s*[:\-]?\s*/gi, ''],
        [/\bGameplay\b\s*[:\-]?\s*/gi, ''],
        [/\bprioritize\b/gi, 'use first'],
        [/\bprioritizing\b/gi, 'using first'],
        [/\bvariant\b/gi, 'version'],
        [/\bclarifying question\b/gi, 'quick question'],
        [/\bclarification\b/gi, 'quick question'],
        [/\butilize\b/gi, 'use'],
        [/\binformation\b/gi, 'info'],
        [/\binstructions\b/gi, 'steps'],
        [/\bapproximately\b/gi, 'about'],
        [/\beventually\b/gi, 'later'],
        [/\bprecarious\b/gi, 'risky'],
        [/\beliminated\b/gi, 'out'],
        [/\bdetermine\b/gi, 'figure out'],
      ];
      for (const [re, value] of replacements) {
        t = t.replace(re, value);
      }

      // Turn long paragraphs into short bullet lines.
      const MAX_LINES = isFollowUpThread ? 4 : 5;
      const MAX_LINE_CHARS = 72;

      const stop = new Set([
        'what',
        'when',
        'where',
        'why',
        'how',
        'does',
        'do',
        'i',
        'you',
        'your',
        'the',
        'a',
        'an',
        'and',
        'or',
        'to',
        'for',
        'of',
        'in',
        'on',
        'with',
        'is',
        'are',
        'be',
        'make',
        'makes',
        'made',
        'then',
        'next',
      ]);

      const keywordTokens = question
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .map((w) => w.trim())
        .filter(Boolean)
        .filter((w) => w.length >= 3 && !stop.has(w));

      const filterLinesByKeywords = (lines: string[]) => {
        if (isFollowUpThread) return lines;
        if (!questionOnly || keywordTokens.length === 0) return lines;
        const filtered = lines.filter((l) =>
          keywordTokens.some((k) => l.toLowerCase().includes(k))
        );
        return filtered.length ? filtered : lines;
      };

      const normalize = t.replace(/[ \t]{2,}/g, ' ');
      const newlineLines = normalize
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);

      const clampLine = (s: string) => {
        const line = s.trim();
        if (line.length <= MAX_LINE_CHARS) return line;
        return line.slice(0, MAX_LINE_CHARS).replace(/\s+\S*$/, '').trim();
      };

      if (newlineLines.length >= 2) {
        const finalLines = filterLinesByKeywords(newlineLines).slice(0, MAX_LINES);
        return formatAsRulebookBullets(finalLines.map(clampLine).join('\n'), MAX_LINES);
      }

      const sentences = normalize
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const finalSentences = filterLinesByKeywords(sentences).slice(0, MAX_LINES);
      return formatAsRulebookBullets(finalSentences.map(clampLine).join('\n'), MAX_LINES);
    };

    const houseRulesContext = buildHouseRulesContext(houseRules);
    const systemPrompt = [
      'You are a tabletop game coach inside a mobile app.',
      'You help with: (1) game rules — how to play, scoring, turn order, disputes; (2) custom score sheets — rows/columns, rounds, players, what to track.',
      "Answer the user's question directly.",
      'Friendly. Cheerful. Like a coach.',
      'Format EVERY reply as a SHORT bullet list: each line starts with “• ” (bullet + space).',
      'Usually 3-5 bullets. One clear idea per bullet. No long paragraphs or numbered essays.',
      'Keep each bullet to one short line when possible. Simple words only.',
      'Avoid filler, history, branding, and producer/company info.',
      'Do NOT restate the question.',
      'Never add “Source:”, links, or website names unless the user explicitly asks where you got the information.',
      'Use house rules when they apply; they override public rule summaries.',
      'Public rule text may appear in the reference block below; use it for facts and for follow-up questions about the same game.',
      'That excerpt skips Overview/background unless the user asked for history or an overview. For “how to play,” it starts at How to Play—do not invent or lean on cut background text.',
      'For score sheet design: suggest concrete row names and how many players; say they can build it in the app’s Scoring → Custom sheet chat.',
      'If you need one missing detail, ask ONE short bullet that is a single question (then stop).',
      'If house rules apply, name them once in a bullet, then answer in the next bullets.',
      'If the user follows up without naming a new game, treat it as the same game as earlier user messages—never substitute a different game’s goal or how-to-play.',
      'On short follow-up questions (scoring, turn order, one card), answer that topic directly—do not repeat the whole prior reply.',
      'If the user’s latest message is a short reply (e.g. “round 1”, “yes”, a number), treat it as their answer to your previous message—acknowledge it and give the next useful step. Do not repeat the same “Tell me…” prompt you already sent.',
      'For Rook: scoring must come from (1) House Rules above when the game name matches this thread, or (2) the rule reference excerpt below when present. Do not invent or recall point values from memory—especially do not mention 1s as 15 (or any value for 1s) unless that exact text appears in House Rules or in the excerpt. If neither source lists a rank, say to check the deck or add House Rules.',
      'If the user asks what “they” or “those” are worth (or “how much”) right after counters or scoring was discussed, answer with counter/point values from those sources—not a generic “count points at the end” line unless that is what they asked.',
      ...(isFollowUpThread
        ? [
          'This is a follow-up. The user’s latest message is the only question you must answer.',
          'Earlier user and assistant messages are context for which game and topic apply—use them so you do not switch games or contradict what you already explained.',
          'Do not recap the full game, setup, or objective unless the latest message asks for that.',
          'Reply with the fewest bullets that fully answer the latest message (often 2–4). Skip side topics.',
        ]
        : []),
      threadGameWithoutExcerpt,
      houseRulesContext,
      gameRulesReferenceBlock,
    ]
      .filter((block) => block.trim().length > 0)
      .join('\n');

    // Full thread (user + assistant) so follow-ups refer to the same game and prior explanation.
    const userQuestion = question.trim() || 'The user uploaded an image and wants help applying game rules.';

    const userContent: any[] = [];
    userContent.push({ type: 'text', text: userQuestion });

    let imageDataUrl: string | null = null;
    if (imageUri) {
      imageDataUrl = await imageUriToDataUrl(imageUri);
      userContent.push({
        type: 'image_url',
        image_url: { url: imageDataUrl },
      });
    }

    const priorMessages = allMessages.slice(0, -1);
    const dialogue: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    for (const m of priorMessages.slice(-RULEBOOK_OPENAI_HISTORY_MAX_MESSAGES)) {
      if (m.isUser) {
        const t = m.text?.trim();
        if (t) {
          dialogue.push({
            role: 'user',
            content: truncateForRulebookContext(t, RULEBOOK_OPENAI_USER_CHAR_MAX),
          });
        }
      } else {
        const t = m.text?.trim();
        if (t) {
          dialogue.push({
            role: 'assistant',
            content: truncateForRulebookContext(t, RULEBOOK_OPENAI_ASSISTANT_CHAR_MAX),
          });
        }
      }
    }

    const body = {
      model: 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: isFollowUpThread ? 240 : 260,
      messages: [
        { role: 'system', content: systemPrompt },
        ...dialogue,
        {
          role: 'user',
          content: imageDataUrl ? userContent : userQuestion,
        },
      ],
    };

    const res = await openaiChatCompletions(body);

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI request failed: ${res.status} ${text}`);
    }

    const json = (await res.json()) as any;
    return postProcessAiText(json?.choices?.[0]?.message?.content?.trim() || '');
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photo library to upload images.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setSelectedImage(result.assets[0].uri);
    }
  };

  const handleSend = async () => {
    if (isSending) return;
    if (!inputText.trim() && !selectedImage) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputText.trim(),
      imageUri: selectedImage || undefined,
      isUser: true,
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInputText('');
    setSelectedImage(null);

    setIsSending(true);
    try {
      const aiText =
        hasCloudLlm(getGameAssistantConfig())
          ? await getOpenAIResponse({
            question: userMessage.text,
            imageUri: userMessage.imageUri,
            allMessages: nextMessages,
            houseRules,
          })
          : await getOfflineAnswer(userMessage.text, userMessage.imageUri, nextMessages);

      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        text: aiText || 'I couldn’t generate a response. Please try again.',
        isUser: false,
      };
      setMessages((prev) => [...prev, aiResponse]);
    } catch (error) {
      let fallback = '';
      try {
        // If cloud/proxy fails (e.g. quota), still use the richer offline path:
        // built-ins + House Rules + GameRules.com extraction when available.
        fallback = await getOfflineAnswer(userMessage.text, userMessage.imageUri, nextMessages);
      } catch {
        const lookupName = resolveLookupGameName(userMessage.text, nextMessages);
        const forcedKey = lookupName ? inferStandardGameKeyFromName(lookupName) ?? undefined : undefined;
        fallback = buildLocalFallbackResponse(
          userMessage.text,
          houseRules,
          forcedKey,
          lookupName ?? undefined,
          nextMessages
        );
      }
      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        text: fallback,
        isUser: false,
      };
      setMessages((prev) => [...prev, aiResponse]);
    } finally {
      setIsSending(false);
    }
  };

  const startNewConversation = () => {
    if (messages.length > 0) {
      const firstMessage = messages.find((m) => m.isUser && m.text?.trim())?.text || 'Conversation';
      const titleSlice = firstMessage.slice(0, 40);
      const entry: RulebookSavedChat = {
        id: `${Date.now()}`,
        title: titleSlice + (firstMessage.length > 40 ? '…' : ''),
        messages: [...messages],
        threadGame: threadGameName,
        updatedAt: Date.now(),
      };
      setPastConversations((prev) => [entry, ...prev].slice(0, 50));
    }
    setMessages([]);
    rulebookThreadGameRef.current = null;
    setThreadGameName(null);
    setMenuOpen(false);
  };

  const openPastConversation = (entry: RulebookSavedChat) => {
    if (messages.length > 0) {
      const firstMessage = messages.find((m) => m.isUser && m.text?.trim())?.text || 'Conversation';
      const titleSlice = firstMessage.slice(0, 40);
      setPastConversations((prev) => {
        const withoutOpen = prev.filter((c) => c.id !== entry.id);
        const draftEntry: RulebookSavedChat = {
          id: `${Date.now()}`,
          title: titleSlice + (firstMessage.length > 40 ? '…' : ''),
          messages: [...messages],
          threadGame: threadGameName,
          updatedAt: Date.now(),
        };
        return [draftEntry, ...withoutOpen].slice(0, 50);
      });
    } else {
      setPastConversations((prev) => prev.filter((c) => c.id !== entry.id));
    }
    setMessages(entry.messages);
    const tg = entry.threadGame ?? null;
    rulebookThreadGameRef.current = tg;
    setThreadGameName(tg);
    setMenuOpen(false);
  };

  const openEditModal = (houseRule: HouseRule) => {
    setEditingRuleId(houseRule.id);
    setNewGameName(houseRule.gameName);
    setNewRules([...houseRule.rules, '']);
    setShowAddRuleModal(true);
  };

  const saveHouseRule = () => {
    const validRules = newRules.filter((r) => r.trim() !== '');
    if (!newGameName.trim() || validRules.length === 0) return;

    if (editingRuleId) {
      setHouseRules((prev) =>
        prev.map((hr) =>
          hr.id === editingRuleId
            ? { ...hr, gameName: newGameName.trim(), rules: validRules }
            : hr
        )
      );
    } else {
      const existingGame = houseRules.find(
        (hr) => hr.gameName.toLowerCase() === newGameName.trim().toLowerCase()
      );

      if (existingGame) {
        setHouseRules((prev) =>
          prev.map((hr) =>
            hr.id === existingGame.id
              ? { ...hr, rules: [...hr.rules, ...validRules] }
              : hr
          )
        );
      } else {
        const newRule: HouseRule = {
          id: Date.now().toString(),
          gameName: newGameName.trim(),
          rules: validRules,
        };
        setHouseRules((prev) => [...prev, newRule]);
      }
    }

    setEditingRuleId(null);
    setNewGameName('');
    setNewRules(['']);
    setShowAddRuleModal(false);
  };

  const confirmDeleteHouseRule = () => {
    if (!editingRuleId) return;
    const idToDelete = editingRuleId;
    const gameLabel = newGameName.trim() || 'this game';
    const message = `Remove all house rules for "${gameLabel}"?`;

    const performDelete = () => {
      setHouseRules((prev) => prev.filter((hr) => hr.id !== idToDelete));
      setEditingRuleId(null);
      setNewGameName('');
      setNewRules(['']);
      setShowAddRuleModal(false);
    };

    // Alert.alert does not surface a usable dialog on React Native Web; use window.confirm.
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`Delete house rules\n\n${message}`)) {
        performDelete();
      }
      return;
    }

    Alert.alert('Delete house rules', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: performDelete },
    ]);
  };

  const updateRule = (index: number, text: string) => {
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (!normalized.includes('\n')) {
      setNewRules((prev) => {
        const next = [...prev];
        next[index] = normalized;
        return next;
      });
      return;
    }

    const segments = normalized.split('\n');
    const first = segments[0] ?? '';
    const additionalLines = segments.slice(1);

    setNewRules((prev) => {
      const tail = prev.slice(index + 1);
      let merged: string[];
      if (
        additionalLines.length === 1 &&
        additionalLines[0] === '' &&
        tail.length > 0 &&
        tail[0] === ''
      ) {
        merged = tail;
      } else {
        merged = [...additionalLines, ...tail];
      }
      const next = [...prev.slice(0, index), first, ...merged];
      if (next[next.length - 1] !== '') {
        next.push('');
      }
      return next;
    });

    setTimeout(() => {
      ruleInputRefs.current[index + 1]?.focus();
    }, 50);
  };

  const handleRuleSubmit = (index: number) => {
    if (index === newRules.length - 1) {
      setNewRules((prev) => [...prev, '']);
      setTimeout(() => {
        ruleInputRefs.current[index + 1]?.focus();
      }, 50);
    } else {
      ruleInputRefs.current[index + 1]?.focus();
    }
  };

  const handleRuleKeyPress = (index: number, key: string) => {
    if (key === 'Backspace' && newRules[index] === '' && index > 0) {
      setNewRules((prev) => prev.filter((_, i) => i !== index));
      setTimeout(() => {
        ruleInputRefs.current[index - 1]?.focus();
      }, 50);
    }
  };

  return (
    <ThemedView style={[styles.screen, { paddingTop: insets.top + SCREEN_EXTRA_TOP_PADDING }]}>
      {/* Header */}
      <View style={styles.header}>
        {activeTab === 'rulebook' ? (
          <Pressable
            style={styles.menuButton}
            onPress={() => setMenuOpen(!menuOpen)}
          >
            <Image
              source={require('@/assets/icons/menu.svg')}
              style={styles.menuIcon}
              tintColor={Colors.light.surface}
              contentFit="contain"
            />
          </Pressable>
        ) : null}

        <View style={styles.tabToggle}>
          <Pressable
            style={[styles.tab, activeTab === 'rulebook' && styles.tabActive]}
            onPress={() => setActiveTab('rulebook')}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === 'rulebook' && styles.tabTextActive,
              ]}
            >
              Rulebook
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, activeTab === 'house-rules' && styles.tabActive]}
            onPress={() => setActiveTab('house-rules')}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === 'house-rules' && styles.tabTextActive,
              ]}
            >
              House Rules
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Side Menu (rule chat only) */}
      {activeTab === 'rulebook' && menuOpen && (
        <>
          <Pressable
            style={styles.menuBackdrop}
            onPress={() => setMenuOpen(false)}
          />
          <Pressable style={styles.sideMenu} onPress={() => { }}>
            <Pressable style={styles.newChatButton} onPress={startNewConversation}>
              <Text style={styles.newChatText}>+ New Chat</Text>
            </Pressable>
            <Text style={styles.menuSectionTitle}>Past Conversations</Text>
            {pastConversations.length === 0 ? (
              <Text style={styles.noConversations}>No past conversations</Text>
            ) : (
              pastConversations.map((conv) => (
                <Pressable
                  key={conv.id}
                  style={styles.conversationItem}
                  onPress={() => openPastConversation(conv)}
                >
                  <Text style={styles.conversationText}>{conv.title}</Text>
                </Pressable>
              ))
            )}
          </Pressable>
        </>
      )}

      {activeTab === 'rulebook' ? (
        /* Chat Area */
        <KeyboardAvoidingView
          style={styles.chatContainer}
          behavior={Platform.OS === 'web' ? undefined : 'padding'}
          keyboardVerticalOffset={keyboardVerticalOffsetBelowSiblingHeader()}
        >
          <View
            style={[styles.rulesContentColumn, isTablet && styles.rulesContentColumnTablet]}>
            {messages.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>Ask away, let&apos;s play!</Text>
                <Text style={styles.emptySubText}>Got a question about how something works?</Text>
                <Text style={styles.emptySubText}>Type it here and I&apos;ll give you the answer you need!</Text>
              </View>
            ) : (
              <FlatList
                data={messages}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.messageList}
                keyboardShouldPersistTaps="always"
                keyboardDismissMode="interactive"
                style={styles.messageListFlex}
                renderItem={({ item }) => (
                  <View
                    style={[
                      styles.messageBubble,
                      item.isUser ? styles.userBubble : styles.aiBubble,
                    ]}
                  >
                    {item.imageUri && (
                      <Image
                        source={{ uri: item.imageUri }}
                        style={styles.messageImage}
                        contentFit="cover"
                      />
                    )}
                    {item.text ? (
                      <Text
                        style={[
                          styles.messageText,
                          item.isUser ? styles.userText : styles.aiText,
                        ]}
                      >
                        {item.text}
                      </Text>
                    ) : null}
                  </View>
                )}
              />
            )}

            {/* Input Area */}
            <View
              style={[
                styles.inputContainer,
                { paddingBottom: Math.max(insets.bottom, 8) + 14 },
              ]}>
              <TextInput
                style={styles.textInput}
                placeholder="Write here"
                placeholderTextColor="#999"
                value={inputText}
                onChangeText={setInputText}
                multiline
                textAlignVertical="top"
                scrollEnabled
                returnKeyType="send"
                onSubmitEditing={handleSend}
                blurOnSubmit
              />

              <Pressable style={styles.sendButton} onPress={() => void handleSend()}>
                <Image
                  source={require('@/assets/icons/send-arrow.svg')}
                  style={styles.sendIcon}
                  contentFit="contain"
                />
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      ) : (
        /* House Rules Area */
        <View
          style={[
            styles.houseRulesContainer,
            styles.rulesContentColumn,
            isTablet && styles.rulesContentColumnTablet,
          ]}>
          <FlatList
            data={houseRules}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.houseRulesList}
            renderItem={({ item }) => (
              <View style={styles.houseRuleCard}>
                <View style={styles.houseRuleContent}>
                  <Text style={styles.houseRuleGameName}>{item.gameName}</Text>
                  {item.rules.map((rule, index) => (
                    <Text key={index} style={styles.houseRuleText}>
                      {index + 1}. {rule}
                    </Text>
                  ))}
                </View>
                <Pressable style={styles.editButton} onPress={() => openEditModal(item)}>
                  <Image
                    source={require('@/assets/icons/edit-pencil.svg')}
                    style={styles.editIcon}
                    tintColor={Colors.dark.background}
                    contentFit="contain"
                  />
                </Pressable>
              </View>
            )}
            ListFooterComponent={
              <Pressable
                style={styles.newHouseRuleButton}
                onPress={() => setShowAddRuleModal(true)}
              >
                <Text style={styles.newHouseRuleText}>New House Rule</Text>
              </Pressable>
            }
          />
        </View>
      )}

      {/* Add / edit house rule — full-bleed green sheet (above tab bar); fields stay inset */}
      {showAddRuleModal && (
        <View
          style={[
            styles.modalOverlay,
            { top: insets.top + SCREEN_EXTRA_TOP_PADDING + 80 },
          ]}>
          <View style={[styles.modalContent, isTablet && styles.modalContentTablet]}>
            <View style={styles.modalTitleRow}>
              <TextInput
                style={styles.gameNameInput}
                placeholder="Game Name"
                placeholderTextColor={Colors.dark.background}
                value={newGameName}
                onChangeText={setNewGameName}
              />
              {editingRuleId ? (
                <Pressable
                  style={styles.modalTitleDeleteButton}
                  onPress={confirmDeleteHouseRule}
                  accessibilityRole="button"
                  accessibilityLabel="Delete house rules"
                >
                  <Image
                    source={require('@/assets/trash-03.svg')}
                    style={styles.modalTitleTrashIcon}
                    contentFit="contain"
                    tintColor={Colors.dark.background}
                  />
                </Pressable>
              ) : null}
            </View>

            <View style={styles.ruleInputContainer}>
              <FlatList
                data={newRules}
                keyExtractor={(_, index) => index.toString()}
                renderItem={({ item, index }) => (
                  <View style={styles.ruleRow}>
                    <Text style={styles.ruleNumber}>{index + 1}.</Text>
                    <TextInput
                      ref={(ref) => {
                        ruleInputRefs.current[index] = ref;
                      }}
                      style={styles.ruleTextInput}
                      placeholder=""
                      placeholderTextColor="#999"
                      value={item}
                      onChangeText={(text) => updateRule(index, text)}
                      onSubmitEditing={() => handleRuleSubmit(index)}
                      onKeyPress={({ nativeEvent }) =>
                        handleRuleKeyPress(index, nativeEvent.key)
                      }
                      blurOnSubmit={false}
                      returnKeyType="next"
                      multiline
                      textAlignVertical="top"
                      {...(Platform.OS === 'android' ? { includeFontPadding: false } : {})}
                    />
                  </View>
                )}
              />
            </View>

            <View style={styles.modalButtons}>
              <Pressable
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowAddRuleModal(false);
                  setEditingRuleId(null);
                  setNewGameName('');
                  setNewRules(['']);
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.modalSaveButton} onPress={saveHouseRule}>
                <Text style={styles.modalSaveText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </ThemedView>
  );
}

/** Single inset applied to both the index and the field so the first line lines up. */
const RULE_LINE_TOP_PAD = Platform.select({ ios: 3, android: 2, default: 0 });

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingTop: 22,
    paddingBottom: 12,
    position: 'relative',
  },
  menuButton: {
    position: 'absolute',
    left: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.dark.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuIcon: {
    width: 20,
    height: 20,
  },
  tabToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.dark.background,
    borderRadius: 25,
    padding: 4,
  },
  tab: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  tabActive: {
    backgroundColor: Colors.light.surface,
  },
  tabText: {
    color: Colors.light.surface,
    fontSize: 14,
  },
  tabTextActive: {
    color: Colors.dark.background,
  },
  menuBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    zIndex: 99,
  },
  sideMenu: {
    position: 'absolute',
    top: 112,
    left: 16,
    width: 250,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 8,
    zIndex: 100,
  },
  newChatButton: {
    backgroundColor: Colors.light.primary,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  newChatText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  menuSectionTitle: {
    fontSize: 12,
    color: '#888',
    marginBottom: 8,
  },
  noConversations: {
    fontSize: 14,
    color: '#AAA',
    fontStyle: 'italic',
  },
  conversationItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  conversationText: {
    fontSize: 14,
    color: Colors.dark.background,
  },
  chatContainer: {
    flex: 1,
  },
  rulesContentColumn: {
    flex: 1,
    width: '100%',
    paddingHorizontal: 24,
  },
  rulesContentColumnTablet: {
    paddingHorizontal: 96,
    maxWidth: 900,
    alignSelf: 'center',
  },
  messageListFlex: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontFamily: Fonts.gameTitle,
    fontSize: 24,
    color: Colors.dark.background,
    fontWeight: '400',
  },
  emptySubText: {
    fontSize: 12,
    color: Colors.dark.background,
    fontWeight: '400',
    marginTop: 6,
    textAlign: 'center',
  },
  messageList: {
    paddingVertical: 12,
    paddingHorizontal: 0,
    gap: 12,
    flexGrow: 1,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 14,
    borderRadius: 18,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: Colors.light.secondary,
  },
  aiBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#F0F0F0',
  },
  messageText: {
    fontSize: 16,
  },
  messageImage: {
    width: 200,
    height: 150,
    borderRadius: 12,
    marginBottom: 8,
  },
  userText: {
    color: '#FFFFFF',
  },
  aiText: {
    color: Colors.dark.background,
  },
  imagePreviewContainer: {
    position: 'relative',
    marginRight: 8,
  },
  imagePreview: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  removeImageButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.dark.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeImageText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 0,
    paddingTop: 6,
    paddingBottom: 0,
    gap: 12,
    width: '100%',
    minWidth: 0,
  },
  plusButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.dark.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusIcon: {
    width: 18,
    height: 18,
  },
  textInput: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    height: 48,
    maxHeight: 48,
    backgroundColor: '#F5F5F5',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '400',
    fontFamily: Fonts.body,
    color: Colors.dark.background,
  },
  sendButton: {
    flexShrink: 0,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.light.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendIcon: {
    width: 18,
    height: 18,
  },
  houseRulesContainer: {
    flex: 1,
  },
  houseRulesList: {
    paddingVertical: 16,
    paddingHorizontal: 0,
    gap: 16,
  },
  houseRuleCard: {
    backgroundColor: Colors.light.accent,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
  },
  houseRuleContent: {
    flex: 1,
  },
  houseRuleGameName: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.dark.background,
    marginBottom: 8,
  },
  houseRuleText: {
    fontSize: 14,
    color: Colors.dark.background,
    marginBottom: 4,
    lineHeight: 20,
  },
  editButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.light.surface,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  editIcon: {
    width: 16,
    height: 16,
  },
  newHouseRuleButton: {
    alignSelf: 'center',
    backgroundColor: Colors.dark.background,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 999,
    marginTop: 8,
  },
  newHouseRuleText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  modalOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    elevation: 1000,
    backgroundColor: Colors.light.accent,
    borderTopLeftRadius: 80,
    borderTopRightRadius: 80,
    overflow: 'hidden',
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 36,
  },
  modalContentTablet: {
    paddingHorizontal: 96,
    maxWidth: 900,
    alignSelf: 'center',
    width: '100%',
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  gameNameInput: {
    flex: 1,
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    fontSize: 18,
    color: Colors.dark.background,
  },
  modalTitleDeleteButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.light.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitleTrashIcon: {
    width: 20,
    height: 20,
  },
  ruleInputContainer: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 16,
    flex: 1,
    marginBottom: 16,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  ruleNumber: {
    fontSize: 16,
    lineHeight: 22,
    color: Colors.dark.background,
    marginRight: 8,
    paddingTop: RULE_LINE_TOP_PAD,
  },
  ruleTextInput: {
    flex: 1,
    fontSize: 16,
    color: Colors.dark.background,
    paddingBottom: 1,
    paddingTop: RULE_LINE_TOP_PAD,
    lineHeight: 22,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  modalCancelButton: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 999,
    backgroundColor: Colors.light.surface,
    alignItems: 'center',
  },
  modalCancelText: {
    color: Colors.dark.background,
    fontSize: 16,
    fontWeight: '500',
  },
  modalSaveButton: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 999,
    backgroundColor: Colors.dark.background,
    alignItems: 'center',
  },
  modalSaveText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
});
