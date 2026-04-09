import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
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
  id: 'scattergories',
  name: 'Scattergories',
  color: Colors.light.secondary,
  route: '/scattergories',
};

const STORAGE_KEY = '@sheet:scattergories';

const ROUNDS = [0, 1, 2];
const SLOT_COUNT = 12;

type AnswersByRound = string[][]; // roundIndex -> slotIndex -> answer text

export default function ScattergoriesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isFavorite, toggleFavorite } = useFavorites();
  const isSheetFavorite = isFavorite(SHEET_INFO.id);
  const { upsertActiveGame, clearActiveGame } = useActiveGames();

  const [roundIndex, setRoundIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswersByRound>(
    ROUNDS.map(() => Array(SLOT_COUNT).fill(''))
  );
  const [roundTotals, setRoundTotals] = useState<string[]>(ROUNDS.map(() => ''));

  const [showCalculator, setShowCalculator] = useState(false);
  const [calcDisplay, setCalcDisplay] = useState('0');
  const [calcPrevValue, setCalcPrevValue] = useState<number | null>(null);
  const [calcOperator, setCalcOperator] = useState<string | null>(null);
  const [calcWaitingForOperand, setCalcWaitingForOperand] = useState(false);

  const persistNow = async () => {
    const hasAnyAnswer = answers.some((round) => round.some((a) => a.trim() !== ''));
    const hasAnyTotal = roundTotals.some((t) => t.trim() !== '');
    const hasAny = hasAnyAnswer || hasAnyTotal;

    if (hasAny) {
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ roundIndex, answers, roundTotals })
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

  useEffect(() => {
    const loadSaved = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!stored) return;
        const parsed = JSON.parse(stored) as {
          roundIndex?: number;
          answers?: AnswersByRound;
          roundTotals?: string[];
        };

        if (typeof parsed.roundIndex === 'number' && parsed.roundIndex >= 0 && parsed.roundIndex < ROUNDS.length) {
          setRoundIndex(parsed.roundIndex);
        }
        if (parsed.answers && parsed.answers.length === ROUNDS.length) {
          setAnswers(parsed.answers);
        }
        if (parsed.roundTotals && parsed.roundTotals.length === ROUNDS.length) {
          setRoundTotals(parsed.roundTotals);
        }
      } catch (e) {
        // Ignore corrupt data
      }
    };
    void loadSaved();
  }, []);

  const handleReset = async () => {
    setRoundIndex(0);
    setAnswers(ROUNDS.map(() => Array(SLOT_COUNT).fill('')));
    setRoundTotals(ROUNDS.map(() => ''));
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

  // Calculator logic (user-only computation; does not auto-fill answers).
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

  const goRound = (next: number) => {
    if (next < 0 || next >= ROUNDS.length) return;
    setRoundIndex(next);
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
        style={styles.tableContainer}
        contentContainerStyle={[SCORE_SHEET_SCROLL_CONTENT, { paddingBottom: 24 }]}
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="interactive"
      >
        <View style={styles.roundHeader}>
          <Pressable
            style={[styles.roundArrowCircle, roundIndex === 0 && styles.roundArrowDisabled]}
            onPress={() => goRound(roundIndex - 1)}
            disabled={roundIndex === 0}
          >
            <Image
              source={require('@/assets/icons/arrow-left.svg')}
              style={styles.roundArrowIconLeft}
              tintColor={Colors.light.surface}
              contentFit="contain"
            />
          </Pressable>

          <Text style={styles.roundHeaderText}>Round {roundIndex + 1}</Text>

          <Pressable
            style={[styles.roundArrowCircle, roundIndex === ROUNDS.length - 1 && styles.roundArrowDisabled]}
            onPress={() => goRound(roundIndex + 1)}
            disabled={roundIndex === ROUNDS.length - 1}
          >
            <Image
              source={require('@/assets/icons/arrow-left.svg')}
              style={styles.roundArrowIconRight}
              tintColor={Colors.light.surface}
              contentFit="contain"
            />
          </Pressable>
        </View>

        <View style={styles.table}>
          {Array.from({ length: SLOT_COUNT }, (_, i) => i + 1).map((n) => (
            <View key={n} style={styles.slotRow}>
              <Text style={styles.slotIndexText}>{n}</Text>
              <TextInput
                style={styles.slotInput}
                value={answers[roundIndex]?.[n - 1] ?? ''}
                onChangeText={(t) => {
                  setAnswers((prev) => {
                    const next = prev.map((r) => [...r]);
                    next[roundIndex][n - 1] = t;
                    return next;
                  });
                }}
                placeholder=""
                placeholderTextColor="#999"
                multiline={false}
                returnKeyType="done"
                blurOnSubmit={true}
              />
            </View>
          ))}

          <View style={styles.totalBar}>
            <Text style={styles.totalBarLabel}>Round Total:</Text>
            <TextInput
              style={styles.totalBarInput}
              keyboardType="number-pad"
              editable
              value={roundTotals[roundIndex] ?? ''}
              onChangeText={(t) =>
                setRoundTotals((prev) => {
                  const next = [...prev];
                  next[roundIndex] = t;
                  return next;
                })
              }
              maxLength={6}
              placeholder=""
              placeholderTextColor="#999"
              textAlign="center"
            />
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
                  if (!calcDisplay.includes('.')) setCalcDisplay(calcDisplay + '.');
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
    marginBottom: 12,
  },

  tableContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  roundHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.light.secondary,
    borderRadius: 2,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 0,
  },
  roundHeaderText: {
    color: Colors.dark.background,
    fontSize: 18,
    fontWeight: '600',
  },
  roundArrowCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.dark.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundArrowDisabled: {
    opacity: 0.35,
  },
  roundArrowIconLeft: {
    width: 14,
    height: 14,
    transform: [{ translateX: 1 }],
  },
  roundArrowIconRight: {
    width: 14,
    height: 14,
    transform: [{ rotate: '180deg' }],
  },

  table: {
    borderWidth: 1,
    borderColor: '#9E9E9E',
    borderRadius: 2,
    overflow: 'hidden',
  },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#9E9E9E',
    paddingHorizontal: 10,
    minHeight: 38,
  },
  slotIndexText: {
    width: 34,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.dark.background,
  },
  slotInput: {
    flex: 1,
    color: Colors.dark.background,
    fontSize: 14,
    paddingVertical: 8,
  },
  totalBar: {
    backgroundColor: Colors.light.secondary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  totalBarLabel: {
    color: Colors.dark.background,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'left',
  },
  totalBarInput: {
    width: 120,
    color: Colors.dark.background,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'left',
    paddingVertical: 6,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },

  bottomButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 20,
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
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
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

