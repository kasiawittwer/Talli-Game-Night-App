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

import { KeyboardTextInput as TextInput } from '@/components/keyboard-text-input';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

const TURNS = Array.from({ length: 20 }, (_, i) => i + 1);
const NUM_PLAYERS = 4;

const SHEET_INFO = {
  id: 'scrabble',
  name: 'Scrabble',
  color: Colors.light.accent,
  route: '/scrabble',
};

const STORAGE_KEY = '@sheet:scrabble';

export default function ScrabbleScreen() {
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

  const [turnScores, setTurnScores] = useState<string[][]>(
    TURNS.map(() => Array(NUM_PLAYERS).fill(''))
  );

  const [unplayedTiles, setUnplayedTiles] = useState<string[]>(
    Array(NUM_PLAYERS).fill('')
  );

  const [opponentsTiles, setOpponentsTiles] = useState<string[]>(
    Array(NUM_PLAYERS).fill('')
  );

  useEffect(() => {
    const loadSaved = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!stored) return;
        const parsed = JSON.parse(stored) as {
          playerNames?: string[];
          turnScores?: string[][];
          unplayedTiles?: string[];
          opponentsTiles?: string[];
        };

        if (parsed.playerNames && parsed.playerNames.length === NUM_PLAYERS) {
          setPlayerNames(parsed.playerNames);
        }
        if (parsed.turnScores && parsed.turnScores.length === TURNS.length) {
          setTurnScores(parsed.turnScores);
        }
        if (parsed.unplayedTiles && parsed.unplayedTiles.length === NUM_PLAYERS) {
          setUnplayedTiles(parsed.unplayedTiles);
        }
        if (parsed.opponentsTiles && parsed.opponentsTiles.length === NUM_PLAYERS) {
          setOpponentsTiles(parsed.opponentsTiles);
        }
      } catch (error) {
        console.error('Failed to load Scrabble sheet:', error);
      }
    };

    void loadSaved();
  }, []);

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

  const updateTurnScore = (turnIndex: number, playerIndex: number, value: string) => {
    setTurnScores((prev) => {
      const updated = prev.map((row) => [...row]);
      updated[turnIndex][playerIndex] = value;
      return updated;
    });
  };

  const updateUnplayedTiles = (playerIndex: number, value: string) => {
    setUnplayedTiles((prev) => {
      const updated = [...prev];
      updated[playerIndex] = value;
      return updated;
    });
  };

  const updateOpponentsTiles = (playerIndex: number, value: string) => {
    setOpponentsTiles((prev) => {
      const updated = [...prev];
      updated[playerIndex] = value;
      return updated;
    });
  };

  const calculateTotal = (playerIndex: number) => {
    const turnTotal = turnScores.reduce((sum, row) => {
      const val = parseInt(row[playerIndex], 10);
      return sum + (isNaN(val) ? 0 : val);
    }, 0);

    const unplayed = parseInt(unplayedTiles[playerIndex], 10) || 0;
    const opponents = parseInt(opponentsTiles[playerIndex], 10) || 0;

    return turnTotal - unplayed + opponents;
  };

  const persistNow = async () => {
    const hasAnyScore =
      Object.values(turnScores).some((row) => row.some((cell) => cell !== '')) ||
      unplayedTiles.some((v) => v !== '') ||
      opponentsTiles.some((v) => v !== '');

    if (hasAnyScore) {
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ playerNames, turnScores, unplayedTiles, opponentsTiles })
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
    setTurnScores(TURNS.map(() => Array(NUM_PLAYERS).fill('')));
    setUnplayedTiles(Array(NUM_PLAYERS).fill(''));
    setOpponentsTiles(Array(NUM_PLAYERS).fill(''));

    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } finally {
      clearActiveGame(SHEET_INFO.id);
    }
  };

  const handleDone = async () => {
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
            void handleDone();
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
      <Text style={styles.title}>Scrabble</Text>

      {/* Score Table */}
      <ScrollView
        style={styles.tableContainer}
        contentContainerStyle={[SCORE_SHEET_SCROLL_CONTENT, { paddingBottom: 24 }]}
        nestedScrollEnabled
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="interactive"
      >
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          style={styles.horizontalTableScroll}>
          <View style={styles.table}>
            {/* Header Row */}
            <View style={styles.headerRow}>
              <View style={styles.turnHeaderCell}>
                <Text style={styles.turnHeaderText}>Turn</Text>
              </View>
              {playerNames.map((name, idx) => (
                <View key={idx} style={styles.playerHeaderCell}>
                  <TextInput
                    style={styles.playerNameInput}
                    value={name}
                    onChangeText={(text) => updatePlayerName(idx, text)}
                    textAlign="center"
                  />
                </View>
              ))}
            </View>

            {/* Turn Rows */}
            {TURNS.map((turn, turnIdx) => (
              <View key={turn} style={styles.scoreRow}>
                <View style={styles.turnCell}>
                  <Text style={styles.turnText}>{turn}</Text>
                </View>
                {playerNames.map((_, playerIdx) => (
                  <View key={playerIdx} style={styles.scoreCell}>
                    <TextInput
                      style={styles.scoreCellInput}
                      value={turnScores[turnIdx][playerIdx]}
                      onChangeText={(val) => updateTurnScore(turnIdx, playerIdx, val)}
                      keyboardType="number-pad"
                      maxLength={4}
                    />
                  </View>
                ))}
              </View>
            ))}

            {/* Unplayed Tiles Row */}
            <View style={styles.specialRow}>
              <View style={styles.specialLabelCell}>
                <Text style={styles.specialLabelText}>Unplayed Tiles</Text>
              </View>
              {playerNames.map((_, playerIdx) => (
                <View key={playerIdx} style={styles.specialScoreCell}>
                  <TextInput
                    style={styles.specialScoreInput}
                    value={unplayedTiles[playerIdx]}
                    onChangeText={(val) => updateUnplayedTiles(playerIdx, val)}
                    keyboardType="number-pad"
                    maxLength={3}
                  />
                </View>
              ))}
            </View>

            {/* Opponents Tiles Row */}
            <View style={styles.specialRow}>
              <View style={styles.specialLabelCell}>
                <Text style={styles.specialLabelText}>Opponents Tiles</Text>
              </View>
              {playerNames.map((_, playerIdx) => (
                <View key={playerIdx} style={styles.specialScoreCell}>
                  <TextInput
                    style={styles.specialScoreInput}
                    value={opponentsTiles[playerIdx]}
                    onChangeText={(val) => updateOpponentsTiles(playerIdx, val)}
                    keyboardType="number-pad"
                    maxLength={3}
                  />
                </View>
              ))}
            </View>

            {/* Total Points Row */}
            <View style={styles.specialRow}>
              <View style={styles.specialLabelCell}>
                <Text style={styles.specialLabelText}>Total Points</Text>
              </View>
              {playerNames.map((_, playerIdx) => (
                <View key={playerIdx} style={styles.totalScoreCell}>
                  <Text style={styles.totalScoreText}>{calculateTotal(playerIdx)}</Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>

        {/* Bottom Buttons */}
        <View style={styles.bottomButtons}>
          <Pressable style={styles.resetButton} onPress={handleReset}>
            <Text style={styles.resetButtonText}>Reset</Text>
          </Pressable>
          <Pressable style={styles.doneButton} onPress={handleDone}>
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerIcon: {
    width: 20,
    height: 20,
  },
  title: {
    fontFamily: Fonts.gameTitle,
    fontSize: 28,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
    color: Colors.dark.background,
  },
  tableContainer: {
    flex: 1,
  },
  /** Inner table scrolls horizontally when wide */
  horizontalTableScroll: {
    width: '100%',
  },
  table: {
    borderWidth: 1,
    borderColor: '#000',
  },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: Colors.dark.background,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
  },
  turnHeaderCell: {
    width: 90,
    paddingVertical: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#000',
  },
  turnHeaderText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  playerHeaderCell: {
    width: 68,
    paddingVertical: 6,
    borderRightWidth: 1,
    borderRightColor: '#000',
  },
  playerNameInput: {
    fontSize: 9,
    fontWeight: '500',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  scoreRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#DDD',
  },
  turnCell: {
    width: 90,
    paddingVertical: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#000',
  },
  turnText: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.dark.background,
  },
  scoreCell: {
    width: 68,
    borderRightWidth: 1,
    borderRightColor: '#DDD',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scoreCellInput: {
    width: '100%',
    height: 32,
    textAlign: 'center',
    fontSize: 12,
    color: Colors.dark.background,
  },
  specialRow: {
    flexDirection: 'row',
    backgroundColor: Colors.light.accent,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
  },
  specialLabelCell: {
    width: 90,
    paddingVertical: 8,
    paddingHorizontal: 6,
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#000',
  },
  specialLabelText: {
    fontSize: 10,
    fontWeight: '500',
    color: Colors.dark.background,
  },
  specialScoreCell: {
    width: 68,
    borderRightWidth: 1,
    borderRightColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  specialScoreInput: {
    width: '100%',
    height: 32,
    textAlign: 'center',
    fontSize: 12,
    color: Colors.dark.background,
  },
  totalScoreCell: {
    width: 68,
    borderRightWidth: 1,
    borderRightColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
  },
  totalScoreText: {
    fontSize: 14,
    fontWeight: '700',
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
