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
import { SCORE_SHEET_SCROLL_CONTENT } from '@/constants/score-sheet-layout';
import { Colors, Fonts } from '@/constants/theme';
import { useFavorites } from '@/context/favorites-context';
import { useActiveGames } from '@/context/active-games-context';
import { ScoreSheetBottomNav } from '@/components/ui/score-sheet-bottom-nav';

const SHEET_INFO = {
  id: 'rook',
  name: 'Rook',
  color: Colors.light.accent,
  route: '/rook',
};

const STORAGE_KEY = '@sheet:rook';

const NUM_TEAMS = 2;
const ROUNDS = 12;

type RoundsRow = string[]; // length NUM_TEAMS

function parseNum(s: string) {
  const v = parseInt(s, 10);
  return Number.isNaN(v) ? 0 : v;
}

export default function RookScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isFavorite, toggleFavorite } = useFavorites();
  const isSheetFavorite = isFavorite(SHEET_INFO.id);
  const { upsertActiveGame, clearActiveGame } = useActiveGames();

  const [teamNames, setTeamNames] = useState<string[]>(['Team Name', 'Team Name']);
  const [scores, setScores] = useState<RoundsRow[]>(
    Array.from({ length: ROUNDS }, () => Array(NUM_TEAMS).fill(''))
  );

  const [showCalculator, setShowCalculator] = useState(false);
  const [calcDisplay, setCalcDisplay] = useState('0');
  const [calcPrevValue, setCalcPrevValue] = useState<number | null>(null);
  const [calcOperator, setCalcOperator] = useState<string | null>(null);
  const [calcWaitingForOperand, setCalcWaitingForOperand] = useState(false);

  const totals = useMemo(() => {
    return Array.from({ length: NUM_TEAMS }, (_, teamIdx) =>
      scores.reduce((sum, row) => sum + parseNum(row[teamIdx]), 0)
    );
  }, [scores]);

  useEffect(() => {
    const loadSaved = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!stored) return;

        const parsed = JSON.parse(stored) as {
          teamNames?: string[];
          scores?: RoundsRow[];
        };

        if (parsed.teamNames && parsed.teamNames.length === NUM_TEAMS) {
          setTeamNames(parsed.teamNames);
        }
        if (parsed.scores && Array.isArray(parsed.scores)) {
          const nextScores: RoundsRow[] = Array.from({ length: ROUNDS }, (_, roundIdx) => {
            const oldRow = parsed.scores[roundIdx];
            if (Array.isArray(oldRow)) return oldRow.slice(0, NUM_TEAMS) as RoundsRow;
            return Array(NUM_TEAMS).fill('');
          });
          setScores(nextScores);
        }
      } catch {
        // ignore corrupt storage
      }
    };

    void loadSaved();
  }, []);

  const persistNow = async () => {
    const hasAny = scores.some((row) => row.some((v) => v.trim() !== ''));

    if (!hasAny) {
      await AsyncStorage.removeItem(STORAGE_KEY);
      clearActiveGame(SHEET_INFO.id);
      return;
    }

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ scores, teamNames }));
    upsertActiveGame({
      id: SHEET_INFO.id,
      name: SHEET_INFO.name,
      route: SHEET_INFO.route,
      color: SHEET_INFO.color,
      storageKey: STORAGE_KEY,
    });
  };

  const handleReset = async () => {
    setTeamNames(['Team Name', 'Team Name']);
    setScores(Array.from({ length: ROUNDS }, () => Array(NUM_TEAMS).fill('')));
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

  const updateScoreCell = (roundIdx: number, teamIdx: number, value: string) => {
    setScores((prev) => {
      const next = prev.map((row) => [...row]);
      next[roundIdx][teamIdx] = value;
      return next;
    });
  };

  // Calculator logic (user-only computation UI; doesn't auto-fill fields).
  const performCalculation = (left: number, right: number, op: string) => {
    switch (op) {
      case '+':
        return left + right;
      case '-':
        return left - right;
      case '*':
        return left * right;
      case '/':
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
    <View style={[styles.screen, { paddingTop: insets.top }]}>
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

      <Text style={styles.title}>{SHEET_INFO.name}</Text>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[SCORE_SHEET_SCROLL_CONTENT, styles.scrollContent]}
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="interactive"
      >
        <View style={styles.table}>
          {/* Team header row */}
          <View style={styles.teamsHeaderRow}>
            {teamNames.map((name, idx) => (
              <View key={idx} style={[styles.teamHeaderCell, idx === 0 && styles.teamSplit]}>
                <TextInput
                  style={styles.teamHeaderInput}
                  value={name}
                  onChangeText={(t) =>
                    setTeamNames((prev) => {
                      const next = [...prev];
                      next[idx] = t;
                      return next;
                    })
                  }
                  textAlign="center"
                  maxLength={18}
                />
              </View>
            ))}
          </View>

          {scores.map((row, roundIdx) => (
            <View key={roundIdx} style={styles.tableRow}>
              {row.map((value, teamIdx) => (
                <View
                  key={teamIdx}
                  style={[styles.scoreCell, teamIdx === 0 && styles.teamSplit]}
                >
                  <TextInput
                    style={styles.cellInput}
                    keyboardType="number-pad"
                    value={value}
                    onChangeText={(t) => updateScoreCell(roundIdx, teamIdx, t)}
                    maxLength={6}
                    textAlign="center"
                  />
                </View>
              ))}
            </View>
          ))}

          {/* Total footer */}
          <View style={styles.totalRow}>
            {totals.map((t, teamIdx) => (
              <View
                key={teamIdx}
                style={[styles.totalCell, teamIdx === 0 && styles.teamSplit]}
              >
                <Text style={styles.totalCellText}>
                  {t > 0 ? `Total: ${t}` : 'Total:'}
                </Text>
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
      </KeyboardAvoidingView>

      <ScoreSheetBottomNav />

      {/* Calculator Modal */}
      {showCalculator && (
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
                  ? `${calcPrevValue} ${calcOperator} ${
                      calcWaitingForOperand ? '' : calcDisplay
                    }`
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
                <Pressable style={styles.calcBtnOrange} onPress={() => calcInputOperator('/')}>
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
                <Pressable style={styles.calcBtnOrange} onPress={() => calcInputOperator('*')}>
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
                <Pressable
                  style={[styles.calcBtn, styles.calcBtnZero]}
                  onPress={() => calcInputDigit('0')}
                >
                  <Text style={styles.calcBtnText}>0</Text>
                </Pressable>
                <Pressable
                  style={styles.calcBtn}
                  onPress={() => {
                    if (!calcDisplay.includes('.')) setCalcDisplay(calcDisplay + '.');
                  }}
                >
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 110,
  },
  table: {
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  teamsHeaderRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(206, 213, 100, 0.75)', // Yellow Grass tint
  },
  teamHeaderCell: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
  },
  teamHeaderInput: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.dark.background,
    textAlign: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#000000',
  },
  scoreCell: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  teamSplit: {
    borderRightWidth: 1,
    borderRightColor: '#000000',
  },
  cellInput: {
    width: '100%',
    color: Colors.dark.background,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 10,
  },
  totalRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(206, 213, 100, 0.75)', // Yellow Grass tint
  },
  totalCell: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
  },
  totalCellText: {
    color: Colors.dark.background,
    fontSize: 16,
    fontWeight: '500',
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

  calcOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  calcContainer: {
    width: '88%',
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#000000',
  },
  calcHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  calcTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.dark.background,
  },
  calcClose: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.dark.background,
  },
  calcDisplay: {
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: '#9E9E9E',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  calcExpressionText: {
    color: Colors.dark.background,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'right',
  },
  calcDisplayText: {
    color: Colors.dark.background,
    fontSize: 32,
    fontWeight: '800',
    textAlign: 'right',
  },
  calcButtons: {
    gap: 10,
  },
  calcRow: {
    flexDirection: 'row',
    gap: 10,
  },
  calcBtn: {
    flex: 1,
    backgroundColor: Colors.light.background,
    borderWidth: 1,
    borderColor: '#9E9E9E',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calcBtnZero: {
    flex: 1.1,
  },
  calcBtnGray: {
    flex: 1,
    backgroundColor: '#ECECEC',
    borderWidth: 1,
    borderColor: '#D0D0D0',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calcBtnOrange: {
    flex: 1,
    backgroundColor: Colors.light.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calcBtnText: {
    color: Colors.dark.background,
    fontSize: 18,
    fontWeight: '700',
  },
  calcBtnTextWhite: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
});

