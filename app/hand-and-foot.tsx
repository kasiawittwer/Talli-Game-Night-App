import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardTextInput as TextInput } from '@/components/keyboard-text-input';
import { iosKeyboardOffsetWithSafeTop } from '@/constants/keyboard';
import { SCORE_SHEET_NAME_MAX_LENGTH } from '@/constants/score-sheet-input';
import {
  SCORE_SHEET_PAGE_COLUMN,
  SCORE_SHEET_PAGE_COLUMN_TABLET,
  SCORE_SHEET_SCROLL_CONTENT,
} from '@/constants/score-sheet-layout';
import { Colors, Fonts, SCREEN_EXTRA_TOP_PADDING, TABLET_MIN_WIDTH } from '@/constants/theme';
import { useLayoutDimensions } from '@/hooks/use-layout-dimensions';
import { useFavorites } from '@/context/favorites-context';
import { useActiveGames } from '@/context/active-games-context';
import { ScoreSheetBottomNav } from '@/components/ui/score-sheet-bottom-nav';
import { scoreSheetCalculatorStyles } from '@/constants/score-sheet-calculator-styles';

const SHEET_INFO = {
  id: 'hand-and-foot',
  name: 'Hand & Foot',
  color: Colors.light.primary,
  route: '/hand-and-foot',
};

const STORAGE_KEY = '@sheet:hand-and-foot';

const NUM_PLAYERS = 2;
const ROUND_POINTS = [50, 90, 120, 150];

type RoundRowScores = {
  perfectDeal: string[]; // length 2
  books: string[]; // length 2
  player1CardCounts: string[]; // length 2 (one value per team)
  player2CardCounts: string[]; // length 2 (one value per team)
};

function parseNum(s: string) {
  const v = parseInt(s, 10);
  return Number.isNaN(v) ? 0 : v;
}

export default function HandAndFootScreen() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useLayoutDimensions();
  const isTablet = windowWidth >= TABLET_MIN_WIDTH;
  const router = useRouter();
  const { isFavorite, toggleFavorite } = useFavorites();
  const isSheetFavorite = isFavorite(SHEET_INFO.id);
  const { upsertActiveGame, clearActiveGame } = useActiveGames();

  const [teamNames, setTeamNames] = useState<string[]>(['Team Name', 'Team Name']);

  const [showCalculator, setShowCalculator] = useState(false);
  const [calcDisplay, setCalcDisplay] = useState('0');
  const [calcPrevValue, setCalcPrevValue] = useState<number | null>(null);
  const [calcOperator, setCalcOperator] = useState<string | null>(null);
  const [calcWaitingForOperand, setCalcWaitingForOperand] = useState(false);

  const [rounds, setRounds] = useState<RoundRowScores[]>(
    ROUND_POINTS.map(() => ({
      perfectDeal: Array(NUM_PLAYERS).fill(''),
      books: Array(NUM_PLAYERS).fill(''),
      player1CardCounts: Array(NUM_PLAYERS).fill(''),
      player2CardCounts: Array(NUM_PLAYERS).fill(''),
    }))
  );

  useEffect(() => {
    const loadSaved = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!stored) return;
        const parsed = JSON.parse(stored) as {
          rounds?: RoundRowScores[];
          teamNames?: string[];
        };

        if (parsed.teamNames && parsed.teamNames.length === NUM_PLAYERS) {
          setTeamNames(parsed.teamNames);
        }
        if (parsed.rounds && parsed.rounds.length === ROUND_POINTS.length) {
          // Migrate older stored shapes that used `cardCounts` into the new per-row fields.
          const migrated = parsed.rounds.map((r: any) => {
            const perfectDeal: string[] = Array.isArray(r?.perfectDeal) ? r.perfectDeal : Array(NUM_PLAYERS).fill('');
            const books: string[] = Array.isArray(r?.books) ? r.books : Array(NUM_PLAYERS).fill('');

            // Back-compat: older versions stored a single `cardCounts` array.
            const legacyCardCounts: string[] = Array.isArray(r?.cardCounts)
              ? r.cardCounts
              : Array(NUM_PLAYERS).fill('');

            // Legacy mapping:
            // - Old UI allowed input on Player 1 row (team column 0) => legacyCardCounts[0]
            // - Old UI allowed input on Player 2 row (team column 1) => legacyCardCounts[1]
            const player1CardCounts: string[] = Array.isArray(r?.player1CardCounts)
              ? r.player1CardCounts
              : Array.isArray(r?.player1CardCount)
                ? r.player1CardCount
                : [legacyCardCounts?.[0] ?? '', ''];

            const player2CardCounts: string[] = Array.isArray(r?.player2CardCounts)
              ? r.player2CardCounts
              : Array.isArray(r?.player2CardCount)
                ? r.player2CardCount
                : ['', legacyCardCounts?.[1] ?? ''];

            return {
              perfectDeal,
              books,
              player1CardCounts: player1CardCounts.slice(0, NUM_PLAYERS),
              player2CardCounts: player2CardCounts.slice(0, NUM_PLAYERS),
            } as RoundRowScores;
          });

          setRounds(migrated);
        }
      } catch {
        // ignore corrupt storage
      }
    };

    void loadSaved();
  }, []);

  const persistNow = async () => {
    const hasAny = rounds.some(
      (r) =>
        r.perfectDeal.some((v) => v.trim() !== '') ||
        r.books.some((v) => v.trim() !== '') ||
        r.player1CardCounts.some((v) => v.trim() !== '') ||
        r.player2CardCounts.some((v) => v.trim() !== '')
    );

    if (hasAny) {
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ rounds, teamNames })
      );
      upsertActiveGame({
        id: SHEET_INFO.id,
        name: SHEET_INFO.name,
        route: SHEET_INFO.route,
        color: SHEET_INFO.color,
        storageKey: STORAGE_KEY,
      });
    } else {
      await AsyncStorage.removeItem(STORAGE_KEY);
      clearActiveGame(SHEET_INFO.id);
    }
  };

  const handleReset = async () => {
    const empty = ROUND_POINTS.map(() => ({
      perfectDeal: Array(NUM_PLAYERS).fill(''),
      books: Array(NUM_PLAYERS).fill(''),
      player1CardCounts: Array(NUM_PLAYERS).fill(''),
      player2CardCounts: Array(NUM_PLAYERS).fill(''),
    }));
    setRounds(empty);
    setTeamNames(['Team Name', 'Team Name']);
    await AsyncStorage.removeItem(STORAGE_KEY);
    clearActiveGame(SHEET_INFO.id);
  };

  const handleBackPress = async () => {
    try {
      await persistNow();
    } finally {
      router.replace('/score-sheets?__internal_expo_router_no_animation=true' as any);
    }
  };

  const handleDone = async () => {
    try {
      await persistNow();
    } finally {
      router.replace('/score-sheets?__internal_expo_router_no_animation=true' as any);
    }
  };

  const updateRoundField = (
    roundIdx: number,
    field: keyof Pick<RoundRowScores, 'perfectDeal' | 'books' | 'player1CardCounts' | 'player2CardCounts'>,
    playerIdx: number,
    value: string
  ) => {
    setRounds((prev) => {
      const next = prev.map((r) => ({
        perfectDeal: [...r.perfectDeal],
        books: [...r.books],
        player1CardCounts: [...r.player1CardCounts],
        player2CardCounts: [...r.player2CardCounts],
      }));
      next[roundIdx][field][playerIdx] = value;
      return next;
    });
  };

  const totalsByRound = useMemo(() => {
    return ROUND_POINTS.map((_, roundIdx) => {
      return Array.from({ length: NUM_PLAYERS }, (_, playerIdx) => {
        const r = rounds[roundIdx];
        const total =
          parseNum(r.perfectDeal[playerIdx]) +
          parseNum(r.books[playerIdx]) +
          parseNum(r.player1CardCounts[playerIdx]) +
          parseNum(r.player2CardCounts[playerIdx]);
        return total;
      });
    });
  }, [rounds]);

  const grandTotals = useMemo(() => {
    return Array.from({ length: NUM_PLAYERS }, (_, playerIdx) =>
      totalsByRound.reduce((sum, roundTotals) => sum + (roundTotals[playerIdx] ?? 0), 0)
    );
  }, [totalsByRound]);

  // Calculator logic (user-only computation UI; doesn't auto-fill fields).
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

  return (
    <View style={[styles.screen, { paddingTop: insets.top + SCREEN_EXTRA_TOP_PADDING }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={iosKeyboardOffsetWithSafeTop(insets.top)}
      >
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => void handleBackPress()}>
          <Image
            source={require('@/assets/icons/arrow-left.svg')}
            style={styles.headerIcon}
            tintColor={Colors.light.surface}
            contentFit="contain"
          />
        </Pressable>

        <View style={styles.headerRight}>
          <Pressable style={styles.headerButton} onPress={() => setShowCalculator(true)}>
            <Image
              source={require('@/assets/icons/calculator.svg')}
              style={styles.headerIcon}
              tintColor={Colors.light.surface}
              contentFit="contain"
            />
          </Pressable>

          <Pressable style={styles.headerButton} onPress={() => toggleFavorite(SHEET_INFO)}>
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
      </View>

      <View style={[SCORE_SHEET_PAGE_COLUMN, isTablet && SCORE_SHEET_PAGE_COLUMN_TABLET]}>
      <Text style={styles.title}>{SHEET_INFO.name}</Text>

      <ScrollView
        style={styles.tableContainer}
        contentContainerStyle={[SCORE_SHEET_SCROLL_CONTENT, { paddingBottom: 24 }]}
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="interactive"
      >
        <View style={styles.table}>
          {/* Team header row */}
          <View style={styles.teamsHeaderRow}>
            <View style={styles.labelCell}>
              <Text style={styles.labelText}>{''}</Text>
            </View>
            {teamNames.map((name, idx) => (
              <View key={idx} style={styles.teamHeaderCell}>
                <TextInput
                  style={styles.teamHeaderInput}
                  value={name}
                  onChangeText={(t) => {
                    setTeamNames((prev) => {
                      const next = [...prev];
                      next[idx] = t;
                      return next;
                    });
                  }}
                  textAlign="center"
                  maxLength={SCORE_SHEET_NAME_MAX_LENGTH}
                />
              </View>
            ))}
          </View>

          {ROUND_POINTS.map((points, roundIdx) => (
            <View key={roundIdx}>
              <View style={styles.roundBar}>
                <Text style={styles.roundBarText}>
                  Round {roundIdx + 1}: {points} Points
                </Text>
              </View>

              {/* Perfect Deal */}
              <View style={styles.row}>
                <View style={styles.labelCell}>
                  <Text style={styles.labelText}>Perfect Deal</Text>
                </View>
                {Array.from({ length: NUM_PLAYERS }).map((_, playerIdx) => (
                  <View
                    key={playerIdx}
                    style={[styles.valueCell, playerIdx === 0 && styles.teamSplit]}
                  >
                    <TextInput
                      style={styles.cellInput}
                      keyboardType="number-pad"
                      value={rounds[roundIdx].perfectDeal[playerIdx]}
                      onChangeText={(t) =>
                        updateRoundField(roundIdx, 'perfectDeal', playerIdx, t)
                      }
                      maxLength={6}
                      textAlign="center"
                    />
                  </View>
                ))}
              </View>

              {/* Books */}
              <View style={styles.row}>
                <View style={styles.labelCell}>
                  <Text style={styles.labelText}>Books</Text>
                </View>
                {Array.from({ length: NUM_PLAYERS }).map((_, playerIdx) => (
                  <View
                    key={playerIdx}
                    style={[styles.valueCell, playerIdx === 0 && styles.teamSplit]}
                  >
                    <TextInput
                      style={styles.cellInput}
                      keyboardType="number-pad"
                      value={rounds[roundIdx].books[playerIdx]}
                      onChangeText={(t) => updateRoundField(roundIdx, 'books', playerIdx, t)}
                      maxLength={6}
                      textAlign="center"
                    />
                  </View>
                ))}
              </View>

              {/* Player 1 Card Count */}
              <View style={styles.row}>
                <View style={styles.labelCell}>
                  <Text style={styles.labelText}>Player 1 Card Count</Text>
                </View>
                {Array.from({ length: NUM_PLAYERS }).map((_, teamIdx) => (
                  <View
                    key={teamIdx}
                    style={[styles.valueCell, teamIdx === 0 && styles.teamSplit]}
                  >
                    <TextInput
                      style={styles.cellInput}
                      keyboardType="number-pad"
                      value={rounds[roundIdx].player1CardCounts[teamIdx]}
                      onChangeText={(t) =>
                        updateRoundField(roundIdx, 'player1CardCounts', teamIdx, t)
                      }
                      maxLength={6}
                      textAlign="center"
                    />
                  </View>
                ))}
              </View>

              {/* Player 2 Card Count */}
              <View style={styles.row}>
                <View style={styles.labelCell}>
                  <Text style={styles.labelText}>Player 2 Card Count</Text>
                </View>
                {Array.from({ length: NUM_PLAYERS }).map((_, teamIdx) => (
                  <View
                    key={teamIdx}
                    style={[styles.valueCell, teamIdx === 0 && styles.teamSplit]}
                  >
                    <TextInput
                      style={styles.cellInput}
                      keyboardType="number-pad"
                      value={rounds[roundIdx].player2CardCounts[teamIdx]}
                      onChangeText={(t) =>
                        updateRoundField(roundIdx, 'player2CardCounts', teamIdx, t)
                      }
                      maxLength={6}
                      textAlign="center"
                    />
                  </View>
                ))}
              </View>

              {/* Total Round */}
              <View style={styles.rowTotal}>
                <View style={styles.labelCellTotal}>
                  <Text style={styles.totalLabelText}>Total Round {roundIdx + 1}</Text>
                </View>
                {Array.from({ length: NUM_PLAYERS }).map((_, playerIdx) => (
                  <View
                    key={playerIdx}
                    style={[styles.valueCell, playerIdx === 0 && styles.teamSplit]}
                  >
                    <Text style={styles.totalValueText}>
                      {totalsByRound[roundIdx][playerIdx]}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ))}

          {/* Grand total */}
          <View style={styles.rowTotal}>
            <View style={styles.labelCellTotal}>
              <Text style={styles.totalLabelText}>Grand Total</Text>
            </View>
            {Array.from({ length: NUM_PLAYERS }).map((_, playerIdx) => (
              <View
                key={playerIdx}
                style={[styles.valueCell, playerIdx === 0 && styles.teamSplit]}
              >
                <Text style={styles.totalValueText}>{grandTotals[playerIdx]}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Bottom Buttons */}
        <View style={styles.bottomButtons}>
          <Pressable style={styles.resetButton} onPress={() => void handleReset()}>
            <Text style={styles.resetButtonText}>Reset</Text>
          </Pressable>
          <Pressable style={styles.doneButton} onPress={() => void handleDone()}>
            <Text style={styles.doneButtonText}>Done</Text>
          </Pressable>
        </View>
      </ScrollView>
      </View>
      </KeyboardAvoidingView>

      <ScoreSheetBottomNav />

      {/* Calculator Modal */}
      {showCalculator && (
        <View style={scoreSheetCalculatorStyles.calcOverlay}>
          <View style={scoreSheetCalculatorStyles.calcContainer}>
            <View style={scoreSheetCalculatorStyles.calcHeader}>
              <Text style={scoreSheetCalculatorStyles.calcTitle}>Calculator</Text>
              <Pressable onPress={() => setShowCalculator(false)}>
                <Text style={scoreSheetCalculatorStyles.calcClose}>✕</Text>
              </Pressable>
            </View>

            <View style={scoreSheetCalculatorStyles.calcDisplay}>
              <Text style={scoreSheetCalculatorStyles.calcExpressionText} numberOfLines={1}>
                {calcPrevValue !== null && calcOperator
                  ? `${calcPrevValue} ${calcOperator} ${
                      calcWaitingForOperand ? '' : calcDisplay
                    }`
                  : ''}
              </Text>
              <Text style={scoreSheetCalculatorStyles.calcDisplayText} numberOfLines={1} adjustsFontSizeToFit>
                {calcDisplay}
              </Text>
            </View>

            <View style={scoreSheetCalculatorStyles.calcButtons}>
              <View style={scoreSheetCalculatorStyles.calcRow}>
                <Pressable style={scoreSheetCalculatorStyles.calcBtnGray} onPress={calcClear}>
                  <Text style={scoreSheetCalculatorStyles.calcBtnText}>C</Text>
                </Pressable>
                <Pressable style={scoreSheetCalculatorStyles.calcBtnGray} onPress={calcToggleSign}>
                  <Text style={scoreSheetCalculatorStyles.calcBtnText}>±</Text>
                </Pressable>
                <Pressable style={scoreSheetCalculatorStyles.calcBtnGray} onPress={calcPercent}>
                  <Text style={scoreSheetCalculatorStyles.calcBtnText}>%</Text>
                </Pressable>
                <Pressable style={scoreSheetCalculatorStyles.calcBtnOrange} onPress={() => calcInputOperator('÷')}>
                  <Text style={scoreSheetCalculatorStyles.calcBtnTextWhite}>÷</Text>
                </Pressable>
              </View>

              <View style={scoreSheetCalculatorStyles.calcRow}>
                <Pressable style={scoreSheetCalculatorStyles.calcBtn} onPress={() => calcInputDigit('7')}>
                  <Text style={scoreSheetCalculatorStyles.calcBtnText}>7</Text>
                </Pressable>
                <Pressable style={scoreSheetCalculatorStyles.calcBtn} onPress={() => calcInputDigit('8')}>
                  <Text style={scoreSheetCalculatorStyles.calcBtnText}>8</Text>
                </Pressable>
                <Pressable style={scoreSheetCalculatorStyles.calcBtn} onPress={() => calcInputDigit('9')}>
                  <Text style={scoreSheetCalculatorStyles.calcBtnText}>9</Text>
                </Pressable>
                <Pressable style={scoreSheetCalculatorStyles.calcBtnOrange} onPress={() => calcInputOperator('×')}>
                  <Text style={scoreSheetCalculatorStyles.calcBtnTextWhite}>×</Text>
                </Pressable>
              </View>

              <View style={scoreSheetCalculatorStyles.calcRow}>
                <Pressable style={scoreSheetCalculatorStyles.calcBtn} onPress={() => calcInputDigit('4')}>
                  <Text style={scoreSheetCalculatorStyles.calcBtnText}>4</Text>
                </Pressable>
                <Pressable style={scoreSheetCalculatorStyles.calcBtn} onPress={() => calcInputDigit('5')}>
                  <Text style={scoreSheetCalculatorStyles.calcBtnText}>5</Text>
                </Pressable>
                <Pressable style={scoreSheetCalculatorStyles.calcBtn} onPress={() => calcInputDigit('6')}>
                  <Text style={scoreSheetCalculatorStyles.calcBtnText}>6</Text>
                </Pressable>
                <Pressable style={scoreSheetCalculatorStyles.calcBtnOrange} onPress={() => calcInputOperator('-')}>
                  <Text style={scoreSheetCalculatorStyles.calcBtnTextWhite}>−</Text>
                </Pressable>
              </View>

              <View style={scoreSheetCalculatorStyles.calcRow}>
                <Pressable style={scoreSheetCalculatorStyles.calcBtn} onPress={() => calcInputDigit('1')}>
                  <Text style={scoreSheetCalculatorStyles.calcBtnText}>1</Text>
                </Pressable>
                <Pressable style={scoreSheetCalculatorStyles.calcBtn} onPress={() => calcInputDigit('2')}>
                  <Text style={scoreSheetCalculatorStyles.calcBtnText}>2</Text>
                </Pressable>
                <Pressable style={scoreSheetCalculatorStyles.calcBtn} onPress={() => calcInputDigit('3')}>
                  <Text style={scoreSheetCalculatorStyles.calcBtnText}>3</Text>
                </Pressable>
                <Pressable style={scoreSheetCalculatorStyles.calcBtnOrange} onPress={() => calcInputOperator('+')}>
                  <Text style={scoreSheetCalculatorStyles.calcBtnTextWhite}>+</Text>
                </Pressable>
              </View>

              <View style={scoreSheetCalculatorStyles.calcRow}>
                <Pressable style={[scoreSheetCalculatorStyles.calcBtn, scoreSheetCalculatorStyles.calcBtnZero]} onPress={() => calcInputDigit('0')}>
                  <Text style={scoreSheetCalculatorStyles.calcBtnText}>0</Text>
                </Pressable>
                <Pressable style={scoreSheetCalculatorStyles.calcBtn} onPress={() => {
                  if (!calcDisplay.includes('.')) setCalcDisplay(calcDisplay + '.');
                }}>
                  <Text style={scoreSheetCalculatorStyles.calcBtnText}>.</Text>
                </Pressable>
                <Pressable style={scoreSheetCalculatorStyles.calcBtnOrange} onPress={calcEquals}>
                  <Text style={scoreSheetCalculatorStyles.calcBtnTextWhite}>=</Text>
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
    paddingBottom: 110,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.dark.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    gap: 12,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.dark.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIcon: {
    width: 20,
    height: 20,
  },
  title: {
    fontFamily: Fonts.gameTitle,
    fontSize: 28,
    fontWeight: '600',
    color: Colors.dark.background,
    textAlign: 'center',
    marginBottom: 16,
  },

  tableContainer: {
    flex: 1,
  },
  table: {
    borderWidth: 1,
    borderColor: '#9E9E9E',
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  teamsHeaderRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(235, 87, 41, 0.5)', // 50% True Orange tint
    borderBottomWidth: 1,
    borderBottomColor: '#9E9E9E',
  },
  teamHeaderCell: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRightWidth: 1,
    borderRightColor: '#9E9E9E',
  },
  teamHeaderInput: {
    width: '100%',
    minWidth: 0,
    alignSelf: 'stretch',
    overflow: 'hidden',
    fontSize: 13,
    fontWeight: '600',
    color: Colors.dark.background,
    textAlign: 'center',
  },
  roundBar: {
    backgroundColor: Colors.light.primary,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#000000',
  },
  roundBarText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },

  row: {
    flexDirection: 'row',
    minHeight: 44,
    borderBottomWidth: 1,
    borderBottomColor: '#9E9E9E',
  },
  rowTotal: {
    flexDirection: 'row',
    minHeight: 44,
    borderBottomWidth: 1,
    borderBottomColor: '#000000',
    backgroundColor: '#FFFFFF',
  },
  labelCell: {
    width: 170,
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRightWidth: 1,
    borderRightColor: '#9E9E9E',
  },
  labelCellTotal: {
    width: 170,
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRightWidth: 1,
    borderRightColor: '#000000',
  },
  labelText: {
    color: Colors.dark.background,
    fontSize: 14,
    fontWeight: '500',
  },
  totalLabelText: {
    color: Colors.dark.background,
    fontSize: 14,
    fontWeight: '700',
  },
  valueCell: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  teamSplit: {
    borderRightWidth: 1,
    borderRightColor: '#9E9E9E',
  },
  cellInput: {
    width: '100%',
    minWidth: 0,
    overflow: 'hidden',
    color: Colors.dark.background,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 8,
  },
  cellInputDisabled: {
    color: 'transparent',
  },
  totalValueText: {
    textAlign: 'center',
    color: Colors.dark.background,
    fontSize: 14,
    fontWeight: '700',
  },

  bottomButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    paddingBottom: 24,
    paddingTop: 12,
    paddingHorizontal: 16,
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

});

