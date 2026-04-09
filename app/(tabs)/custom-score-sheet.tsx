import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Fragment, useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { KeyboardTextInput as TextInput } from '@/components/keyboard-text-input';
import { keyboardVerticalOffsetBelowSiblingHeader } from '@/constants/keyboard';
import { Colors, Fonts } from '@/constants/theme';
import { useActiveGames } from '@/context/active-games-context';
import { useFavorites } from '@/context/favorites-context';
import { generateScoreSheetTemplateFromLlm } from '@/lib/game-assistant-llm';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type SheetTemplate = {
  title: string;
  playerCount: number;
  rowLabels: string[];
};

type CustomSheetEntry = {
  id: string;
  name: string;
  color: string;
  template: SheetTemplate;
  createdAt: number;
  updatedAt: number;
};

type CustomSheetData = {
  playerNames: string[];
  scores: Record<string, string>;
};

const CUSTOM_SHEETS_KEY = '@customSheets';

/** Max players per custom sheet; UI stacks 4-column tables when count exceeds {@link PLAYERS_PER_SCORE_TABLE}. */
const MAX_CUSTOM_SHEET_PLAYERS = 12;
const PLAYERS_PER_SCORE_TABLE = 4;

const clampInt = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function chunkPlayerIndices(totalPlayers: number, blockSize: number): number[][] {
  if (totalPlayers <= 0 || blockSize <= 0) return [];
  const chunks: number[][] = [];
  for (let start = 0; start < totalPlayers; start += blockSize) {
    const len = Math.min(blockSize, totalPlayers - start);
    chunks.push(Array.from({ length: len }, (_, k) => start + k));
  }
  return chunks;
}

function parseDraftPlayerCount(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return 3;
  const n = parseInt(trimmed, 10);
  if (Number.isNaN(n)) return 3;
  return clampInt(n, 1, MAX_CUSTOM_SHEET_PLAYERS);
}

const MIN_SCORE_ROWS = 5;
const MAX_SCORE_ROWS = 30;

/**
 * Row/round count from the bottom field. When non-null, this count is used for the sheet (overrides LLM).
 * Accepts plain numbers ("12"), or phrases like "10 rows" / "15 rounds".
 */
function parseDraftRowCount(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const lower = t.toLowerCase();
  const roundMatch =
    lower.match(/(\d+)\s*(rounds|turns|rows|entries)\b/) || lower.match(/(\d+)\s*round\b/);
  if (roundMatch?.[1]) {
    const n = parseInt(roundMatch[1], 10);
    if (!Number.isNaN(n)) return clampInt(n, MIN_SCORE_ROWS, MAX_SCORE_ROWS);
  }
  if (/^\d+$/.test(t)) {
    return clampInt(parseInt(t, 10), MIN_SCORE_ROWS, MAX_SCORE_ROWS);
  }
  const leading = t.match(/^(\d{1,2})\b/);
  if (leading) {
    return clampInt(parseInt(leading[1], 10), MIN_SCORE_ROWS, MAX_SCORE_ROWS);
  }
  return null;
}

function makeRowLabels(count: number): string[] {
  const n = clampInt(count, MIN_SCORE_ROWS, MAX_SCORE_ROWS);
  return Array.from({ length: n }, (_, i) => `${i + 1}`);
}

function inferTemplateFromPrompt(prompt: string): SheetTemplate {
  const p = prompt.trim();
  const lower = p.toLowerCase();

  // Title: try to find "for <GameName>" or use first quoted/short token.
  const forMatch = p.match(/for\s+(.+?)(?:\s|$)/i);
  const quotedMatch = p.match(/["“](.+?)["”]/);
  // IMPORTANT: do not use the whole prompt as the title.
  // Only set a title when the user explicitly provides one (quotes or "for ...").
  const titleGuess = (quotedMatch?.[1] || forMatch?.[1] || 'Game Name').trim();

  // Player count.
  const playerMatch =
    lower.match(/(\d+)\s*player/) ||
    lower.match(/(\d+)\s*players/) ||
    lower.match(/(\w+)\s*player/);

  let playerCount = 3;
  if (playerMatch?.[1]) {
    const n = parseInt(playerMatch[1], 10);
    if (!Number.isNaN(n)) {
      playerCount = n;
    } else {
      const word = playerMatch[1].toLowerCase();
      // Longer number words first ("eleven" contains "one").
      const wordHits: [string, number][] = [
        ['twelve', 12],
        ['eleven', 11],
        ['ten', 10],
        ['nine', 9],
        ['eight', 8],
        ['seven', 7],
        ['six', 6],
        ['five', 5],
        ['four', 4],
        ['three', 3],
        ['two', 2],
        ['single', 1],
        ['solo', 1],
        ['one', 1],
      ];
      for (const [kw, val] of wordHits) {
        if (word.includes(kw)) {
          playerCount = val;
          break;
        }
      }
    }
  }
  playerCount = clampInt(playerCount, 1, MAX_CUSTOM_SHEET_PLAYERS);

  // Rows/rounds: try to find "10 rounds" / "12 turns" etc.
  const roundMatch =
    lower.match(/(\d+)\s*(rounds|turns|rows|entries)\b/) || lower.match(/(\d+)\s*round\b/);
  let rowCount = 12;
  if (roundMatch?.[1]) {
    const n = parseInt(roundMatch[1], 10);
    if (!Number.isNaN(n)) rowCount = n;
  }
  rowCount = clampInt(rowCount, MIN_SCORE_ROWS, MAX_SCORE_ROWS);

  const rowLabels = makeRowLabels(rowCount);

  const cleanedTitle = titleGuess.replace(/\s+/g, ' ').trim();
  const finalTitle = cleanedTitle.length < 3 ? 'Game Name' : cleanedTitle;

  return {
    title: finalTitle,
    playerCount,
    rowLabels,
  };
}

const makeCustomSheetId = () => `c_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
const getCustomSheetDataStorageKey = (id: string) => `@sheet:custom:${id}`;

async function loadCustomSheetsList(): Promise<CustomSheetEntry[]> {
  try {
    const stored = await AsyncStorage.getItem(CUSTOM_SHEETS_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as CustomSheetEntry[];
  } catch {
    return [];
  }
}

async function upsertCustomSheetEntry(entry: CustomSheetEntry) {
  const list = await loadCustomSheetsList();
  const existingIndex = list.findIndex((s) => s.id === entry.id);
  if (existingIndex >= 0) {
    const next = [...list];
    next[existingIndex] = entry;
    await AsyncStorage.setItem(CUSTOM_SHEETS_KEY, JSON.stringify(next));
    return;
  }
  await AsyncStorage.setItem(CUSTOM_SHEETS_KEY, JSON.stringify([...list, entry]));
}

export default function CustomScoreSheetScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ sheetId?: string }>();
  const sheetId = params.sheetId;

  const { upsertActiveGame, clearActiveGame } = useActiveGames();
  const { isFavorite, toggleFavorite } = useFavorites();

  const [mode, setMode] = useState<'chat' | 'card'>(sheetId ? 'card' : 'chat');

  const [prompt, setPrompt] = useState('');
  const [draftGameName, setDraftGameName] = useState('');
  /** Raw text in the yellow “# of Players” field; empty → default 3 on generate */
  const [playersField, setPlayersField] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [promptInputHeight, setPromptInputHeight] = useState(46);
  const PROMPT_INPUT_MAX_HEIGHT = 220;
  const PROMPT_INPUT_MIN_HEIGHT = 46;
  const PROMPT_INPUT_LINE_HEIGHT_EST = 22;

  const [customSheetId, setCustomSheetId] = useState<string | null>(sheetId ?? null);
  const [template, setTemplate] = useState<SheetTemplate | null>(null);
  const [playerNames, setPlayerNames] = useState<string[]>(['Name', 'Name', 'Name', 'Name']);
  const [scores, setScores] = useState<Record<string, string>>({});

  const [isEditingTitle, setIsEditingTitle] = useState(false);

  const sheetScrollRef = useRef<ScrollView>(null);
  const chatKavOffset = keyboardVerticalOffsetBelowSiblingHeader();
  const kavBehavior = Platform.OS === 'web' ? undefined : 'padding';

  const rowLabels = template?.rowLabels ?? [];
  /** Clamped 1–12; UI stacks 4-column tables when there are more than four players. */
  const sheetPlayerCount = template
    ? clampInt(
        Number.isFinite(template.playerCount) ? template.playerCount : 3,
        1,
        MAX_CUSTOM_SHEET_PLAYERS
      )
    : 0;
  const scoreKey = (rowIdx: number, playerIdx: number) => `${rowIdx}:${playerIdx}`;

  const getTotal = (playerIdx: number) => {
    if (!template) return 0;
    let sum = 0;
    for (let r = 0; r < template.rowLabels.length; r++) {
      const val = parseInt(scores[scoreKey(r, playerIdx)] || '', 10);
      sum += Number.isNaN(val) ? 0 : val;
    }
    return sum;
  };

  const ensurePlayerNamesLength = (count: number) => {
    setPlayerNames((prev) => {
      const next = [...prev];
      while (next.length < count) next.push('Name');
      return next.slice(0, count);
    });
  };

  // Calculator (same UX as premade sheets; it is only for user computation).
  const [showCalculator, setShowCalculator] = useState(false);
  const [calcDisplay, setCalcDisplay] = useState('0');
  const [calcPrevValue, setCalcPrevValue] = useState<number | null>(null);
  const [calcOperator, setCalcOperator] = useState<string | null>(null);
  const [calcWaitingForOperand, setCalcWaitingForOperand] = useState(false);

  const performCalculation = (left: number, right: number, op: string) => {
    switch (op) {
      case '+':
        return left + right;
      case '-':
        return left - right;
      case '×':
        return left * right;
      case '÷':
        return right !== 0 ? left / right : 0;
      default:
        return right;
    }
  };

  const calcInputDigit = (digit: string) => {
    if (calcWaitingForOperand) {
      setCalcDisplay(digit);
      setCalcWaitingForOperand(false);
    } else {
      setCalcDisplay(calcDisplay === '0' ? digit : calcDisplay + digit);
    }
  };

  const calcInputOperator = (nextOperator: string) => {
    const inputValue = parseFloat(calcDisplay);

    if (calcPrevValue === null) {
      setCalcPrevValue(inputValue);
    } else if (calcOperator) {
      const result = performCalculation(calcPrevValue, inputValue, calcOperator);
      setCalcDisplay(String(result));
      setCalcPrevValue(result);
    }

    setCalcWaitingForOperand(true);
    setCalcOperator(nextOperator);
  };

  const calcEquals = () => {
    if (calcOperator && calcPrevValue !== null) {
      const inputValue = parseFloat(calcDisplay);
      const result = performCalculation(calcPrevValue, inputValue, calcOperator);
      setCalcDisplay(String(result));
      setCalcPrevValue(null);
      setCalcOperator(null);
      setCalcWaitingForOperand(true);
    }
  };

  const calcClear = () => {
    setCalcDisplay('0');
    setCalcPrevValue(null);
    setCalcOperator(null);
    setCalcWaitingForOperand(false);
  };

  const calcToggleSign = () => {
    const value = parseFloat(calcDisplay);
    setCalcDisplay(String(value * -1));
  };

  const calcPercent = () => {
    const value = parseFloat(calcDisplay);
    setCalcDisplay(String(value / 100));
  };

  const resetChatState = () => {
    setMode('chat');
    setCustomSheetId(null);
    setTemplate(null);
    setScores({});
    setPlayerNames(['Name', 'Name', 'Name', 'Name']);
    setPrompt('');
    setDraftGameName('');
    setPlayersField('');
    setIsEditingTitle(false);
    setIsGenerating(false);

    setShowCalculator(false);
    setCalcDisplay('0');
    setCalcPrevValue(null);
    setCalcOperator(null);
    setCalcWaitingForOperand(false);
    setPromptInputHeight(46);
  };

  // Load saved custom sheet when opened with `?sheetId=...`.
  useEffect(() => {
    if (!sheetId) {
      resetChatState();
      return;
    }
    setMode('card');
    setCustomSheetId(sheetId);

    const load = async () => {
      const list = await loadCustomSheetsList();
      const entry = list.find((s) => s.id === sheetId);
      if (!entry) {
        setMode('chat');
        setCustomSheetId(null);
        setTemplate(null);
        return;
      }

      const pc = clampInt(
        Number.isFinite(entry.template.playerCount) && entry.template.playerCount > 0
          ? entry.template.playerCount
          : 3,
        1,
        MAX_CUSTOM_SHEET_PLAYERS
      );
      setTemplate({ ...entry.template, playerCount: pc });
      ensurePlayerNamesLength(pc);

      try {
        const stored = await AsyncStorage.getItem(getCustomSheetDataStorageKey(sheetId));
        if (stored) {
          const parsed = JSON.parse(stored) as CustomSheetData;
          if (parsed?.playerNames?.length) {
            setPlayerNames((prev) => {
              const next = Array.from({ length: pc }, (_, i) => parsed.playerNames[i] ?? prev[i] ?? 'Name');
              return next;
            });
          }
          if (parsed?.scores && typeof parsed.scores === 'object') {
            setScores(parsed.scores);
          }
        }
      } catch {
        // Ignore corrupt/missing data and render with defaults.
      }
    };

    void load();
  }, [sheetId]);

  // Keep template.playerCount aligned with clamped column count (preview + card stay in sync).
  useEffect(() => {
    if (!template) return;
    const n = clampInt(
      Number.isFinite(template.playerCount) ? template.playerCount : 3,
      1,
      MAX_CUSTOM_SHEET_PLAYERS
    );
    if (n !== template.playerCount) {
      setTemplate((t) => (t ? { ...t, playerCount: n } : null));
    }
    ensurePlayerNamesLength(n);
  }, [template?.playerCount]);

  const persistNow = async () => {
    if (!customSheetId || !template) return;

    const hasAnyScore = Object.values(scores).some((v) => v.trim() !== '');
    const storageKey = getCustomSheetDataStorageKey(customSheetId);
    const list = await loadCustomSheetsList();
    const existingEntry = list.find((s) => s.id === customSheetId);
    const createdAt = existingEntry?.createdAt ?? Date.now();

    if (hasAnyScore) {
      const payload: CustomSheetData = { playerNames: playerNames.slice(0, sheetPlayerCount), scores };
      await AsyncStorage.setItem(storageKey, JSON.stringify(payload));

      const customColor = Colors.light.secondary;
      upsertActiveGame({
        id: customSheetId,
        name: template.title,
        route: `/custom-score-sheet?sheetId=${customSheetId}`,
        color: customColor,
        storageKey,
      });
    } else {
      await AsyncStorage.removeItem(storageKey);
      clearActiveGame(customSheetId);
    }

    await upsertCustomSheetEntry({
      id: customSheetId,
      name: template.title,
      color: Colors.light.secondary,
      template: { ...template, playerCount: sheetPlayerCount },
      createdAt,
      updatedAt: Date.now(),
    });
  };

  const handleBackHeader = async () => {
    if (mode === 'card') {
      await persistNow();
      setPrompt('');
    }
    router.push('/score-sheets');
  };

  const buildFullGenerationPrompt = () => {
    const name = draftGameName.trim();
    if (!name) return '';
    const desc = prompt.trim();
    const n = parseDraftPlayerCount(playersField);
    const playerPhrase = n === 1 ? '1 player (solo scoring)' : `${n} players`;
    return `The game is called "${name}". We need ${playerPhrase}.${desc ? ` ${desc}` : ''}`;
  };

  const handleGenerate = async () => {
    const fullPrompt = buildFullGenerationPrompt();
    if (!fullPrompt) {
      Alert.alert('Game name', 'Enter the name of the game, then add details below (optional) and tap send.');
      return;
    }
    setIsGenerating(true);
    setTemplate(null);
    setScores({});
    setIsEditingTitle(false);
    setCustomSheetId(null);

    try {
      const inferred = await generateScoreSheetTemplateFromLlm(fullPrompt, inferTemplateFromPrompt);
      const chosenPlayers = parseDraftPlayerCount(playersField);
      const rowCountFromBottom = parseDraftRowCount(prompt);
      const rowLabels =
        rowCountFromBottom != null
          ? makeRowLabels(rowCountFromBottom)
          : inferred.rowLabels?.length
            ? inferred.rowLabels
            : makeRowLabels(12);
      await new Promise((r) => setTimeout(r, 350));
      const titleCandidate = draftGameName.trim();
      const title =
        titleCandidate.length >= 3
          ? titleCandidate
          : inferred.title.trim().length >= 3
            ? inferred.title
            : 'Game Name';
      setTemplate({
        ...inferred,
        title,
        playerCount: chosenPlayers,
        rowLabels,
      });
      ensurePlayerNamesLength(chosenPlayers);
    } finally {
      setIsGenerating(false);
      setMode('chat');
    }
  };

  const handleXToChat = () => {
    setTemplate(null);
    setScores({});
    setIsEditingTitle(false);
    setCustomSheetId(null);
    setMode('chat');
    setPrompt('');
    setDraftGameName('');
    setPlayersField('');
  };

  const handleAcceptPreviewToCard = async () => {
    if (!template) return;

    const normalizedTemplate: SheetTemplate = { ...template, playerCount: sheetPlayerCount };
    const newId = makeCustomSheetId();
    const entry: CustomSheetEntry = {
      id: newId,
      name: normalizedTemplate.title,
      color: Colors.light.secondary,
      template: normalizedTemplate,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await upsertCustomSheetEntry(entry);
    setCustomSheetId(newId);
    setMode('card');
    // Reset the AI chat portion so when the user starts a new custom sheet it starts fresh.
    setPrompt('');
    setIsEditingTitle(false);
    setIsGenerating(false);
    setShowCalculator(false);

    // Save current player names and any scores typed in the preview right away.
    const storageKey = getCustomSheetDataStorageKey(newId);
    const payload: CustomSheetData = { playerNames: playerNames.slice(0, sheetPlayerCount), scores };
    await AsyncStorage.setItem(storageKey, JSON.stringify(payload));

    // Make the generated sheet its own reusable screen.
    router.replace(`/custom-score-sheet?sheetId=${newId}`);
  };

  const handleResetCard = async () => {
    setScores({});
    if (!customSheetId || !template) return;

    await AsyncStorage.removeItem(getCustomSheetDataStorageKey(customSheetId));
    clearActiveGame(customSheetId);

    // Keep the template entry, but update its (possibly edited) title.
    const list = await loadCustomSheetsList();
    const existingEntry = list.find((s) => s.id === customSheetId);
    await upsertCustomSheetEntry({
      id: customSheetId,
      name: template.title,
      color: Colors.light.secondary,
      template: { ...template, playerCount: sheetPlayerCount },
      createdAt: existingEntry?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    });
  };

  const handleDoneCard = async () => {
    await persistNow();
    setPrompt('');
    router.push('/score-sheets');
  };

  const renderScoreTableBlocks = () => {
    const chunks = chunkPlayerIndices(sheetPlayerCount, PLAYERS_PER_SCORE_TABLE);
    return (
      <View style={styles.table}>
        {chunks.map((indices, chunkIdx) => (
          <Fragment key={`score-chunk-${chunkIdx}`}>
            <View
              style={[
                styles.tableHeaderRow,
                chunkIdx > 0 && styles.tableHeaderRowContinued,
              ]}>
              {indices.map((playerIdx) => (
                <View key={playerIdx} style={styles.playerHeaderCell}>
                  <TextInput
                    style={styles.playerNameInput}
                    value={playerNames[playerIdx] || ''}
                    editable
                    selectTextOnFocus
                    onChangeText={(t) => {
                      setPlayerNames((prev) => {
                        const next = [...prev];
                        next[playerIdx] = t;
                        return next;
                      });
                    }}
                    placeholder={`Player ${playerIdx + 1}`}
                    placeholderTextColor="rgba(255,255,255,0.72)"
                    autoCorrect={false}
                    textAlign="center"
                  />
                </View>
              ))}
            </View>
            {rowLabels.map((_, rowIdx) => (
              <View key={`c${chunkIdx}-row-${rowIdx}`} style={styles.tableRow}>
                {indices.map((playerIdx) => (
                  <View key={playerIdx} style={styles.scoreCell}>
                    <TextInput
                      style={styles.scoreInput}
                      keyboardType="number-pad"
                      value={scores[scoreKey(rowIdx, playerIdx)] || ''}
                      onChangeText={(val) =>
                        setScores((prev) => ({
                          ...prev,
                          [scoreKey(rowIdx, playerIdx)]: val,
                        }))
                      }
                      maxLength={5}
                    />
                  </View>
                ))}
              </View>
            ))}
            <View style={styles.totalSection}>
              <View style={styles.totalTitleRow}>
                <Text style={styles.totalLabel}>Total</Text>
              </View>
              <View style={styles.totalValuesRow}>
                {indices.map((playerIdx) => (
                  <View key={playerIdx} style={styles.totalCell}>
                    <Text style={styles.totalValue}>{getTotal(playerIdx)}</Text>
                  </View>
                ))}
              </View>
            </View>
          </Fragment>
        ))}
      </View>
    );
  };

  const gameTitle = template?.title?.trim() && template.title.trim().length >= 3 ? template.title : 'Game Name';
  const customSheetInfo =
    customSheetId && template
      ? {
        id: customSheetId,
        name: template.title,
        color: Colors.light.secondary,
        route: `/custom-score-sheet?sheetId=${customSheetId}`,
      }
      : null;
  const isSheetFavorite = customSheetInfo ? isFavorite(customSheetInfo.id) : false;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={handleBackHeader}>
          <Image
            source={require('@/assets/icons/arrow-left.svg')}
            style={styles.headerIcon}
            tintColor={Colors.light.surface}
            contentFit="contain"
          />
        </Pressable>
        {mode === 'card' && customSheetInfo && (
          <View style={styles.headerRight}>
            <Pressable style={styles.headerButton} onPress={() => setShowCalculator(true)}>
              <Image
                source={require('@/assets/icons/calculator.svg')}
                style={styles.headerIcon}
                tintColor={Colors.light.surface}
                contentFit="contain"
              />
            </Pressable>

            <Pressable
              style={styles.headerButton}
              onPress={() => toggleFavorite(customSheetInfo)}
            >
              <Image
                source={
                  isSheetFavorite
                    ? require('@/assets/icons/heart-filled.svg')
                    : require('@/assets/icons/heart.svg')
                }
                style={styles.headerIcon}
                tintColor={isSheetFavorite ? Colors.light.primary : Colors.light.surface}
                contentFit="contain"
              />
            </Pressable>
          </View>
        )}
      </View>

      {mode === 'chat' ? (
        !template ? (
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={kavBehavior} keyboardVerticalOffset={chatKavOffset}>
            <ScrollView
              ref={sheetScrollRef}
              style={{ flex: 1 }}
              contentContainerStyle={[styles.scrollContent, styles.scrollContentHero]}
              keyboardShouldPersistTaps="always"
              keyboardDismissMode="interactive"
            >
              <View style={styles.heroOnlyBlock}>
                <Text style={styles.heroText}>Let&apos;s play already!</Text>
                <Text style={styles.heroSubText}>
                  Describe your perfect score sheet{'\n'}
                  and I&apos;ll create it for you!
                </Text>
              </View>
            </ScrollView>

            <View
              style={[
                styles.bottomInputDock,
                {
                  paddingBottom: Math.max(insets.bottom, 6) + 0,
                },
              ]}
            >
              <View style={styles.dockTopRow}>
                <TextInput
                  style={styles.dockGameNameInput}
                  placeholder="Game Name"
                  placeholderTextColor="rgba(255, 253, 245, 0.75)"
                  value={draftGameName}
                  onChangeText={setDraftGameName}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
                <TextInput
                  style={styles.dockPlayersInput}
                  placeholder={`# of Players (1–${MAX_CUSTOM_SHEET_PLAYERS})`}
                  placeholderTextColor="rgba(14, 9, 6, 0.45)"
                  value={playersField}
                  onChangeText={(t) => {
                    const d = t.replace(/\D/g, '').slice(0, 2);
                    if (d === '') {
                      setPlayersField('');
                      return;
                    }
                    const n = parseInt(d, 10);
                    if (n >= 1 && n <= MAX_CUSTOM_SHEET_PLAYERS) setPlayersField(d);
                  }}
                  keyboardType="number-pad"
                  maxLength={2}
                  returnKeyType="done"
                />
              </View>

              <View style={styles.promptBar}>
                <TextInput
                  style={[styles.promptInput, { minHeight: promptInputHeight }]}
                  placeholder="Number of rows/rounds"
                  placeholderTextColor="#999"
                  value={prompt}
                  onChangeText={(t) => {
                    setPrompt(t);

                    const trimmedEnd = t.replace(/\n+$/g, '');
                    const lineCount = trimmedEnd.length === 0 ? 1 : trimmedEnd.split('\n').length;
                    const estimated = PROMPT_INPUT_MIN_HEIGHT + (lineCount - 1) * PROMPT_INPUT_LINE_HEIGHT_EST;
                    const clamped = Math.max(PROMPT_INPUT_MIN_HEIGHT, Math.min(PROMPT_INPUT_MAX_HEIGHT, estimated));

                    setPromptInputHeight((prev) => (clamped < prev ? clamped : prev));
                  }}
                  multiline
                  textAlignVertical="top"
                  scrollEnabled={promptInputHeight >= PROMPT_INPUT_MAX_HEIGHT}
                  onContentSizeChange={(e) => {
                    const h = e.nativeEvent.contentSize.height;
                    const clamped = Math.max(PROMPT_INPUT_MIN_HEIGHT, Math.min(PROMPT_INPUT_MAX_HEIGHT, h));
                    setPromptInputHeight(clamped);
                  }}
                  returnKeyType="send"
                  blurOnSubmit
                  onSubmitEditing={() => {
                    if (!isGenerating) void handleGenerate();
                  }}
                />
                <Pressable
                  style={styles.sendButton}
                  onPress={handleGenerate}
                  disabled={isGenerating}
                >
                  <Image
                    source={require('@/assets/icons/send-arrow.svg')}
                    style={styles.sendIcon}
                    contentFit="contain"
                  />
                </Pressable>
              </View>
            </View>

            {isGenerating && (
              <View style={styles.generatingOverlay}>
                <Text style={styles.generatingText}>Loading scoresheet preview...</Text>
              </View>
            )}
          </KeyboardAvoidingView>
        ) : (
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={kavBehavior} keyboardVerticalOffset={chatKavOffset}>
            <ScrollView
              ref={sheetScrollRef}
              style={{ flex: 1 }}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="always"
              keyboardDismissMode="interactive"
            >
              <View style={styles.previewWrap}>
                <Pressable
                  onPress={() => setIsEditingTitle(true)}
                  style={({ pressed }) => [styles.previewTitleRow, pressed && { opacity: 0.9 }]}
                >
                  {isEditingTitle ? (
                    <TextInput
                      style={styles.previewTitleInput}
                      value={gameTitle}
                      onChangeText={(t) => setTemplate((prev) => (prev ? { ...prev, title: t } : prev))}
                      autoFocus
                      onBlur={() => setIsEditingTitle(false)}
                    />
                  ) : (
                    <Text style={styles.previewTitle}>{gameTitle}</Text>
                  )}
                </Pressable>

                <View style={styles.previewConfirmRow}>
                  <Pressable style={[styles.confirmCircle, styles.confirmX]} onPress={handleXToChat}>
                    <Text style={styles.confirmXText}>X</Text>
                  </Pressable>
                  <Pressable style={[styles.confirmCircle, styles.confirmCheck]} onPress={handleAcceptPreviewToCard}>
                    <Text style={styles.confirmCheckText}>✓</Text>
                  </Pressable>
                </View>

                {renderScoreTableBlocks()}
              </View>
            </ScrollView>

            {isGenerating && (
              <View style={styles.generatingOverlay}>
                <Text style={styles.generatingText}>Loading scoresheet preview...</Text>
              </View>
            )}
          </KeyboardAvoidingView>
        )
      ) : (
        // Card mode — scroll must not vertically center content or the focused field can sit under the keyboard
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={kavBehavior} keyboardVerticalOffset={chatKavOffset}>
          <ScrollView
            ref={sheetScrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={[styles.scrollContentCard, styles.cardScrollContentGrow]}
            showsVerticalScrollIndicator={true}
            keyboardShouldPersistTaps="always"
            keyboardDismissMode="interactive"
            automaticallyAdjustKeyboardInsets
            contentInsetAdjustmentBehavior="automatic"
          >
            {/* Title — tap to edit (same idea as preview) after saving with ✓ */}
            {isEditingTitle ? (
              <TextInput
                style={[styles.cardTitleInput, styles.cardTitleInputSpaced]}
                value={template?.title ?? 'Game Name'}
                onChangeText={(t) => setTemplate((prev) => (prev ? { ...prev, title: t } : prev))}
                autoFocus
                onBlur={() => setIsEditingTitle(false)}
                selectTextOnFocus
              />
            ) : (
              <Pressable
                onPress={() => setIsEditingTitle(true)}
                style={({ pressed }) => [styles.cardTitlePressable, pressed && { opacity: 0.92 }]}
              >
                <Text style={styles.cardTitle}>
                  {template?.title?.trim() && template.title.trim().length >= 3 ? template.title : 'Game Name'}
                </Text>
              </Pressable>
            )}

            {renderScoreTableBlocks()}

            {/* Bottom buttons — scroll with sheet (not fixed above tab bar) */}
            <View style={styles.bottomButtonsCard}>
              <Pressable style={styles.resetButton} onPress={handleResetCard}>
                <Text style={styles.resetButtonText}>Reset</Text>
              </Pressable>
              <Pressable style={styles.doneButton} onPress={handleDoneCard}>
                <Text style={styles.doneButtonText}>Done</Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* Calculator Modal (card mode) */}
      {showCalculator && template && customSheetId && (
        <View style={styles.calcOverlay}>
          <View style={styles.calcContainer}>
            <View style={styles.calcHeader}>
              <Text style={styles.calcTitle}>Calculator</Text>
              <Pressable onPress={() => setShowCalculator(false)}>
                <Text style={styles.calcClose}>✕</Text>
              </Pressable>
            </View>

            <View style={styles.calcDisplay}>
              <Text style={styles.calcExpressionText} numberOfLines={1}>
                {calcPrevValue !== null && calcOperator
                  ? `${calcPrevValue} ${calcOperator} ${calcWaitingForOperand ? '' : calcDisplay}`
                  : ''}
              </Text>
              <Text style={styles.calcDisplayText} numberOfLines={1} adjustsFontSizeToFit>
                {calcDisplay}
              </Text>
            </View>

            <View style={styles.calcButtons}>
              <View style={styles.calcRow}>
                <Pressable style={styles.calcBtnGray} onPress={calcClear}>
                  <Text style={styles.calcBtnText}>C</Text>
                </Pressable>
                <Pressable style={styles.calcBtnGray} onPress={calcToggleSign}>
                  <Text style={styles.calcBtnText}>±</Text>
                </Pressable>
                <Pressable style={styles.calcBtnGray} onPress={calcPercent}>
                  <Text style={styles.calcBtnText}>%</Text>
                </Pressable>
                <Pressable style={styles.calcBtnOrange} onPress={() => calcInputOperator('÷')}>
                  <Text style={styles.calcBtnTextWhite}>÷</Text>
                </Pressable>
              </View>

              <View style={styles.calcRow}>
                <Pressable style={styles.calcBtn} onPress={() => calcInputDigit('7')}>
                  <Text style={styles.calcBtnText}>7</Text>
                </Pressable>
                <Pressable style={styles.calcBtn} onPress={() => calcInputDigit('8')}>
                  <Text style={styles.calcBtnText}>8</Text>
                </Pressable>
                <Pressable style={styles.calcBtn} onPress={() => calcInputDigit('9')}>
                  <Text style={styles.calcBtnText}>9</Text>
                </Pressable>
                <Pressable style={styles.calcBtnOrange} onPress={() => calcInputOperator('×')}>
                  <Text style={styles.calcBtnTextWhite}>×</Text>
                </Pressable>
              </View>

              <View style={styles.calcRow}>
                <Pressable style={styles.calcBtn} onPress={() => calcInputDigit('4')}>
                  <Text style={styles.calcBtnText}>4</Text>
                </Pressable>
                <Pressable style={styles.calcBtn} onPress={() => calcInputDigit('5')}>
                  <Text style={styles.calcBtnText}>5</Text>
                </Pressable>
                <Pressable style={styles.calcBtn} onPress={() => calcInputDigit('6')}>
                  <Text style={styles.calcBtnText}>6</Text>
                </Pressable>
                <Pressable style={styles.calcBtnOrange} onPress={() => calcInputOperator('-')}>
                  <Text style={styles.calcBtnTextWhite}>−</Text>
                </Pressable>
              </View>

              <View style={styles.calcRow}>
                <Pressable style={styles.calcBtn} onPress={() => calcInputDigit('1')}>
                  <Text style={styles.calcBtnText}>1</Text>
                </Pressable>
                <Pressable style={styles.calcBtn} onPress={() => calcInputDigit('2')}>
                  <Text style={styles.calcBtnText}>2</Text>
                </Pressable>
                <Pressable style={styles.calcBtn} onPress={() => calcInputDigit('3')}>
                  <Text style={styles.calcBtnText}>3</Text>
                </Pressable>
                <Pressable style={styles.calcBtnOrange} onPress={() => calcInputOperator('+')}>
                  <Text style={styles.calcBtnTextWhite}>+</Text>
                </Pressable>
              </View>

              <View style={styles.calcRow}>
                <Pressable style={[styles.calcBtn, styles.calcBtnZero]} onPress={() => calcInputDigit('0')}>
                  <Text style={styles.calcBtnText}>0</Text>
                </Pressable>
                <Pressable style={styles.calcBtn} onPress={() => {
                  if (!calcDisplay.includes('.')) {
                    setCalcDisplay(calcDisplay + '.');
                  }
                }}>
                  <Text style={styles.calcBtnText}>.</Text>
                </Pressable>
                <Pressable style={styles.calcBtnOrange} onPress={calcEquals}>
                  <Text style={styles.calcBtnTextWhite}>=</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    gap: 12,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIcon: {
    width: 20,
    height: 20,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    flexGrow: 1,
  },
  scrollContentHero: {
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 320,
  },
  heroOnlyBlock: {
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 32,
  },
  bottomInputDock: {
    paddingHorizontal: 16,
    paddingTop: 4,
    backgroundColor: Colors.light.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(14, 9, 6, 0.08)',
  },
  dockTopRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 10,
  },
  dockGameNameInput: {
    flex: 1,
    backgroundColor: Colors.light.secondary,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 14,
    fontSize: 16,
    fontWeight: '500',
    color: Colors.light.surface,
    fontFamily: Fonts.body,
    textAlign: 'center',
  },
  dockPlayersInput: {
    flex: 1,
    backgroundColor: Colors.light.accent,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 14,
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
    fontFamily: Fonts.body,
    textAlign: 'center',
  },
  heroText: {
    fontFamily: Fonts.gameTitle,
    fontSize: 26,
    fontWeight: '600',
    color: Colors.dark.background,
    textAlign: 'center',
  },
  heroSubText: {
    fontFamily: Fonts.body,
    fontSize: 16,
    fontWeight: '400',
    color: Colors.dark.background,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 22,
    opacity: 0.92,
  },

  previewWrap: {
    paddingTop: 8,
    position: 'relative',
    flex: 1,
  },
  previewTitleRow: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 8,
    marginBottom: 16,
  },
  previewTitle: {
    fontFamily: Fonts.gameTitle,
    fontSize: 28,
    fontWeight: '600',
    color: Colors.dark.background,
    textAlign: 'center',
  },
  previewTitleInput: {
    fontFamily: Fonts.gameTitle,
    fontSize: 28,
    fontWeight: '600',
    color: Colors.dark.background,
    textAlign: 'center',
    width: '100%',
    paddingHorizontal: 12,
  },

  previewConfirmRow: {
    position: 'absolute',
    left: 18,
    right: 18,
    top: 56,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    pointerEvents: 'auto',
    zIndex: 20,
    elevation: 20,
  },
  confirmCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 21,
    elevation: 21,
  },
  confirmX: {
    backgroundColor: Colors.dark.background,
  },
  confirmXText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 14,
  },
  confirmCheck: {
    backgroundColor: Colors.light.primary,
  },
  confirmCheckText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 16,
  },

  scrollContentCard: {
    paddingHorizontal: 16,
    paddingBottom: 120,
  },
  cardTitleRow: {
    paddingTop: 8,
    paddingBottom: 8,
    alignItems: 'center',
  },
  cardTitle: {
    fontFamily: Fonts.gameTitle,
    fontSize: 28,
    fontWeight: '600',
    color: Colors.dark.background,
    textAlign: 'center',
  },
  cardTitlePressable: {
    marginBottom: 16,
    alignSelf: 'stretch',
  },
  cardTitleInputSpaced: {
    marginBottom: 16,
  },
  cardScrollContentGrow: {
    flexGrow: 1,
  },
  cardTitleInput: {
    fontFamily: Fonts.gameTitle,
    fontSize: 28,
    fontWeight: '600',
    color: Colors.dark.background,
    textAlign: 'center',
    width: '100%',
    paddingHorizontal: 12,
  },

  table: {
    borderWidth: 1,
    borderColor: '#000',
    borderRadius: 6,
    overflow: 'hidden',
    zIndex: 1,
  },
  /** Separates the next player-name header from the prior block’s totals (one continuous sheet). */
  tableHeaderRowContinued: {
    borderTopWidth: 1,
    borderTopColor: '#000',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: Colors.light.secondary,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
  },
  playerHeaderCell: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#000',
    paddingVertical: 8,
  },
  playerNameInput: {
    fontSize: 11,
    fontWeight: '500',
    color: '#FFFFFF',
    textAlign: 'center',
    width: '100%',
    minHeight: 30,
    paddingVertical: 6,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#DDD',
  },
  scoreCell: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#DDD',
  },
  scoreInput: {
    width: '100%',
    height: 38,
    textAlign: 'center',
    fontSize: 14,
    color: Colors.dark.background,
  },
  totalSection: {
    backgroundColor: Colors.light.primary,
    borderTopWidth: 1,
    borderTopColor: '#000',
  },
  totalTitleRow: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
  },
  totalValuesRow: {
    flexDirection: 'row',
  },
  totalLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  totalCell: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
    borderRightWidth: 1,
    borderRightColor: '#000',
  },
  totalValue: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  promptBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    paddingHorizontal: 0,
    paddingTop: 4,
  },
  plusButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: Colors.dark.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promptInput: {
    flex: 1,
    minHeight: 46,
    backgroundColor: '#F5F5F5',
    borderRadius: 23,
    paddingHorizontal: 18,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.dark.background,
  },
  sendButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: Colors.light.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendIcon: {
    width: 18,
    height: 18,
  },
  generatingOverlay: {
    position: 'absolute',
    top: 120,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  generatingText: {
    backgroundColor: '#BFD0FF',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    color: '#0E0906',
    fontWeight: '600',
    overflow: 'hidden',
  },

  bottomButtonsCard: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    paddingBottom: 24,
    paddingTop: 12,
    paddingHorizontal: 16,
    backgroundColor: Colors.light.background,
  },
  resetButton: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: Colors.dark.background,
  },
  resetButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  doneButton: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: Colors.light.primary,
  },
  doneButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },

  calcOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  calcContainer: {
    width: '85%',
    backgroundColor: Colors.dark.background,
    borderRadius: 20,
    padding: 16,
  },
  calcHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  calcTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  calcClose: {
    color: '#FFFFFF',
    fontSize: 20,
    padding: 4,
  },
  calcDisplay: {
    backgroundColor: '#1C1C1C',
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
    alignItems: 'flex-end',
  },
  calcExpressionText: {
    color: '#888888',
    fontSize: 18,
    fontWeight: '400',
    marginBottom: 4,
    minHeight: 22,
  },
  calcDisplayText: {
    color: '#FFFFFF',
    fontSize: 40,
    fontWeight: '300',
  },
  calcButtons: {
    gap: 10,
  },
  calcRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  calcBtn: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: '#333333',
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  calcBtnZero: {
    flex: 2,
    aspectRatio: undefined,
  },
  calcBtnGray: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: '#A5A5A5',
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  calcBtnOrange: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: Colors.light.primary,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  calcBtnText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '400',
  },
  calcBtnTextWhite: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '400',
  },
});

