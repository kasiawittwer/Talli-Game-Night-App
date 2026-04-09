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

const ROUNDS = Array.from({ length: 20 }, (_, i) => i + 1);
const NUM_PLAYERS = 3;

const SHEET_INFO = {
  id: 'wizard',
  name: 'Wizard',
  color: Colors.light.secondary,
  route: '/wizard',
};

const STORAGE_KEY = '@sheet:wizard';

export default function WizardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isFavorite, toggleFavorite } = useFavorites();
  const isSheetFavorite = isFavorite(SHEET_INFO.id);
  const { upsertActiveGame, clearActiveGame } = useActiveGames();

  const [playerNames, setPlayerNames] = useState<string[]>(
    Array(NUM_PLAYERS).fill('Name')
  );
  
  // Each round has dealer, score, bid, and made for each player
  const [scores, setScores] = useState<{ dealer: boolean; score: string; bid: string; made: string }[][]>(
    ROUNDS.map(() => Array(NUM_PLAYERS).fill(null).map(() => ({ dealer: false, score: '', bid: '', made: '' })))
  );

  useEffect(() => {
    const loadSaved = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!stored) return;

        const parsed = JSON.parse(stored) as {
          playerNames?: string[];
          scores?: typeof scores;
        };

        if (parsed.playerNames && parsed.playerNames.length === NUM_PLAYERS) {
          setPlayerNames(parsed.playerNames);
        }
        if (parsed.scores && parsed.scores.length === ROUNDS.length) {
          setScores(parsed.scores);
        }
      } catch (error) {
        console.error('Failed to load Wizard sheet:', error);
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

  const updateScore = (
    roundIndex: number,
    playerIndex: number,
    field: 'score' | 'bid' | 'made',
    value: string
  ) => {
    setScores((prev) => {
      const updated = prev.map((row) => row.map((cell) => ({ ...cell })));
      updated[roundIndex][playerIndex][field] = value;
      return updated;
    });
  };

  const toggleDealer = (roundIndex: number, playerIndex: number) => {
    setScores((prev) => {
      const updated = prev.map((row) => row.map((cell) => ({ ...cell })));
      // Clear all dealers for this round first
      updated[roundIndex].forEach((cell) => (cell.dealer = false));
      // Set the clicked one as dealer
      updated[roundIndex][playerIndex].dealer = true;
      return updated;
    });
  };

  const persistNow = async () => {
    const hasAnyScore = scores.some((round) =>
      round.some((cell) => cell.dealer || cell.score !== '' || cell.bid !== '' || cell.made !== '')
    );

    if (hasAnyScore) {
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ playerNames, scores })
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
    setScores(
      ROUNDS.map(() => Array(NUM_PLAYERS).fill(null).map(() => ({ dealer: false, score: '', bid: '', made: '' })))
    );

    setPlayerNames(Array(NUM_PLAYERS).fill('Name'));
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

      {/* Title */}
      <Text style={styles.title}>Wizard</Text>

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
          <View>
            {/* Header Row */}
            <View style={styles.headerRow}>
              <View style={styles.roundHeaderCell} />
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

            {/* Score Rows */}
            {ROUNDS.map((round, roundIdx) => (
              <View key={round} style={styles.scoreRow}>
                <View style={styles.roundCell}>
                  <Text style={styles.roundText}>{round}</Text>
                </View>
                {playerNames.map((_, playerIdx) => (
                  <View key={playerIdx} style={styles.playerScoreCell}>
                    {/* Dealer circle */}
                    <Pressable
                      style={styles.dealerCell}
                      onPress={() => toggleDealer(roundIdx, playerIdx)}
                    >
                      <View
                        style={[
                          styles.dealerCircle,
                          scores[roundIdx][playerIdx].dealer && styles.dealerCircleActive,
                        ]}
                      />
                    </Pressable>

                    {/* Score (big box) */}
                    <View style={styles.scoreCell}>
                      <TextInput
                        style={styles.scoreCellInput}
                        value={scores[roundIdx][playerIdx].score}
                        onChangeText={(val) =>
                          updateScore(roundIdx, playerIdx, 'score', val)
                        }
                        keyboardType="number-pad"
                        maxLength={4}
                      />
                    </View>

                    {/* Bid and Made (stacked vertically) */}
                    <View style={styles.bidMadeStack}>
                      <View style={styles.stackedCell}>
                        <TextInput
                          style={styles.stackedCellInput}
                          value={scores[roundIdx][playerIdx].bid}
                          onChangeText={(val) =>
                            updateScore(roundIdx, playerIdx, 'bid', val)
                          }
                          keyboardType="number-pad"
                          maxLength={2}
                        />
                      </View>
                      <View style={styles.stackedCell}>
                        <TextInput
                          style={styles.stackedCellInput}
                          value={scores[roundIdx][playerIdx].made}
                          onChangeText={(val) =>
                            updateScore(roundIdx, playerIdx, 'made', val)
                          }
                          keyboardType="number-pad"
                          maxLength={2}
                        />
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            ))}
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
    paddingHorizontal: 8,
  },
  /** Full width so the sheet isn’t left-aligned; inner table still scrolls horizontally when wide */
  horizontalTableScroll: {
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
  },
  roundHeaderCell: {
    width: 30,
    borderRightWidth: 1,
    borderRightColor: '#000',
  },
  playerHeaderCell: {
    width: 100,
    backgroundColor: Colors.light.secondary,
    borderRightWidth: 1,
    borderRightColor: '#000',
    paddingVertical: 8,
  },
  playerNameInput: {
    fontSize: 11,
    fontWeight: '500',
    color: Colors.dark.background,
    textAlign: 'center',
  },
  scoreRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#DDD',
  },
  roundCell: {
    width: 30,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#000',
    paddingVertical: 6,
  },
  roundText: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.dark.background,
  },
  playerScoreCell: {
    width: 100,
    flexDirection: 'row',
    borderRightWidth: 1,
    borderRightColor: '#000',
  },
  dealerCell: {
    width: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#DDD',
  },
  dealerCircle: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#CCC',
  },
  dealerCircleActive: {
    backgroundColor: Colors.dark.background,
    borderColor: Colors.dark.background,
  },
  scoreCell: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#DDD',
    paddingVertical: 4,
  },
  scoreCellInput: {
    width: '100%',
    height: 24,
    textAlign: 'center',
    fontSize: 12,
    color: Colors.dark.background,
  },
  bidMadeStack: {
    width: 24,
    flexDirection: 'column',
    borderRightWidth: 1,
    borderRightColor: '#DDD',
  },
  stackedCell: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#DDD',
  },
  stackedCellInput: {
    width: '100%',
    height: '100%',
    textAlign: 'center',
    fontSize: 10,
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
