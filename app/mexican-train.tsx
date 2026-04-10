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
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardTextInput as TextInput } from '@/components/keyboard-text-input';
import { iosKeyboardOffsetWithSafeTop } from '@/constants/keyboard';
import {
  SCORE_SHEET_PAGE_COLUMN,
  SCORE_SHEET_PAGE_COLUMN_TABLET,
  SCORE_SHEET_SCROLL_CONTENT,
} from '@/constants/score-sheet-layout';
import { Colors, Fonts, TABLET_MIN_WIDTH } from '@/constants/theme';
import { useFavorites } from '@/context/favorites-context';
import { useActiveGames } from '@/context/active-games-context';
import { ScoreSheetBottomNav } from '@/components/ui/score-sheet-bottom-nav';
import { scoreSheetCalculatorStyles } from '@/constants/score-sheet-calculator-styles';

const ROUNDS = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];
const NUM_PLAYERS = 4;

const SHEET_INFO = {
  id: 'mexican-train',
  name: 'Mexican Train',
  color: Colors.light.accent,
  route: '/mexican-train',
};

const STORAGE_KEY = '@sheet:mexican-train';

export default function MexicanTrainScreen() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const isTablet = windowWidth >= TABLET_MIN_WIDTH;
  const router = useRouter();
  const { isFavorite, toggleFavorite } = useFavorites();
  const isSheetFavorite = isFavorite(SHEET_INFO.id);
  const { upsertActiveGame, clearActiveGame } = useActiveGames();

  const [playerNames, setPlayerNames] = useState<string[]>(
    Array(NUM_PLAYERS).fill('Name')
  );
  const [scores, setScores] = useState<string[][]>(
    ROUNDS.map(() => Array(NUM_PLAYERS).fill(''))
  );
  const [showCalculator, setShowCalculator] = useState(false);
  const [calcDisplay, setCalcDisplay] = useState('0');
  const [calcPrevValue, setCalcPrevValue] = useState<number | null>(null);
  const [calcOperator, setCalcOperator] = useState<string | null>(null);
  const [calcWaitingForOperand, setCalcWaitingForOperand] = useState(false);

  const updatePlayerName = (index: number, name: string) => {
    setPlayerNames((prev) => {
      const updated = [...prev];
      updated[index] = name;
      return updated;
    });
  };

  const updateScore = (roundIndex: number, playerIndex: number, value: string) => {
    setScores((prev) => {
      const updated = prev.map((row) => [...row]);
      updated[roundIndex][playerIndex] = value;
      return updated;
    });
  };

  const calculateTotal = (playerIndex: number) => {
    return scores.reduce((sum, row) => {
      const val = parseInt(row[playerIndex], 10);
      return sum + (isNaN(val) ? 0 : val);
    }, 0);
  };

  useEffect(() => {
    const loadSaved = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as {
            playerNames?: string[];
            scores?: string[][];
          };
          if (parsed.playerNames && parsed.playerNames.length === NUM_PLAYERS) {
            setPlayerNames(parsed.playerNames);
          }
          if (parsed.scores && parsed.scores.length === ROUNDS.length) {
            setScores(parsed.scores);
          }
        }
      } catch (error) {
        console.error('Failed to load Mexican Train sheet:', error);
      }
    };

    void loadSaved();
  }, []);

  const persistNow = async () => {
    const hasAnyScore = scores.some((row) => row.some((cell) => cell !== ''));
    if (hasAnyScore) {
      const payload = { playerNames, scores };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
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
    // Lightweight autosave for "typing" scenarios.
    // We also flush synchronously on back/done to guarantee persistence.
    const save = async () => {
      try {
        await persistNow();
      } catch (error) {
        console.error('Failed to save Mexican Train sheet:', error);
      }
    };

    void save();
  }, [playerNames, scores, upsertActiveGame, clearActiveGame]);

  const handleReset = () => {
    setScores(ROUNDS.map(() => Array(NUM_PLAYERS).fill('')));
  };

  const handleBackPress = async () => {
    try {
      await persistNow();
    } finally {
      router.replace('/score-sheets?__internal_expo_router_no_animation=true' as any);
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
        <Pressable
          style={styles.backButton}
          onPress={() => {
            void handleBackPress();
          }}
        >
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
          <Pressable
            style={styles.headerButton}
            onPress={() => toggleFavorite(SHEET_INFO)}
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
      </View>

      <View style={[SCORE_SHEET_PAGE_COLUMN, isTablet && SCORE_SHEET_PAGE_COLUMN_TABLET]}>
      {/* Title */}
      <Text style={styles.title}>Mexican Train</Text>

      {/* Score Table */}
      <ScrollView
        style={styles.tableContainer}
        contentContainerStyle={[SCORE_SHEET_SCROLL_CONTENT, { paddingBottom: 24 }]}
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="interactive"
      >
        <View style={styles.table}>
          {/* Header Row */}
          <View style={styles.tableRow}>
            <View style={[styles.roundCell, styles.headerCell]} />
            {playerNames.map((name, index) => (
              <View key={index} style={[styles.playerCell, styles.headerCell]}>
                <TextInput
                  style={styles.playerNameInput}
                  value={name}
                  onChangeText={(text) => updatePlayerName(index, text)}
                  selectTextOnFocus
                />
              </View>
            ))}
          </View>

          {/* Score Rows */}
          {ROUNDS.map((round, roundIndex) => (
            <View key={round} style={styles.tableRow}>
              <View style={styles.roundCell}>
                <Text style={styles.roundText}>{round}</Text>
              </View>
              {playerNames.map((_, playerIndex) => (
                <View key={playerIndex} style={styles.scoreCell}>
                  <TextInput
                    style={styles.scoreInput}
                    keyboardType="number-pad"
                    value={scores[roundIndex][playerIndex]}
                    onChangeText={(text) =>
                      updateScore(roundIndex, playerIndex, text)
                    }
                  />
                </View>
              ))}
            </View>
          ))}

          {/* Total Row */}
          <View style={styles.tableRow}>
            <View style={[styles.roundCell, styles.totalCell]}>
              <Text style={styles.totalLabel}>Total</Text>
            </View>
            {playerNames.map((_, playerIndex) => (
              <View key={playerIndex} style={styles.scoreCell}>
                <Text style={styles.totalValue}>{calculateTotal(playerIndex)}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Bottom Buttons */}
        <View style={styles.bottomButtons}>
          <Pressable style={styles.resetButton} onPress={handleReset}>
            <Text style={styles.resetButtonText}>Reset</Text>
          </Pressable>
          <Pressable
            style={styles.doneButton}
            onPress={() => {
              void handleBackPress();
            }}
          >
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
                  ? `${calcPrevValue} ${calcOperator} ${calcWaitingForOperand ? '' : calcDisplay}`
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
                  if (!calcDisplay.includes('.')) {
                    setCalcDisplay(calcDisplay + '.');
                  }
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
    borderColor: Colors.dark.background,
    borderRadius: 4,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.background,
  },
  roundCell: {
    width: 50,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRightWidth: 1,
    borderRightColor: Colors.dark.background,
    justifyContent: 'center',
  },
  roundText: {
    fontSize: 14,
    color: Colors.dark.background,
  },
  playerCell: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRightWidth: 1,
    borderRightColor: Colors.dark.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCell: {
    backgroundColor: Colors.light.accent,
  },
  playerNameInput: {
    fontSize: 10,
    color: Colors.dark.background,
    textAlign: 'center',
    fontWeight: '600',
  },
  scoreCell: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRightWidth: 1,
    borderRightColor: Colors.dark.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scoreInput: {
    fontSize: 14,
    color: Colors.dark.background,
    textAlign: 'center',
    width: '100%',
  },
  totalCell: {
    backgroundColor: Colors.light.accent,
  },
  totalLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.dark.background,
  },
  totalValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.dark.background,
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
});
