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
  id: 'yahtzee',
  name: 'Yahtzee',
  color: Colors.light.primary,
  route: '/yahtzee',
};

const STORAGE_KEY = '@sheet:yahtzee';

type DiceDotsProps = {
  count: number;
};

function DiceDots({ count }: DiceDotsProps) {
  const DOT_SIZE = 5;
  const DICE_SIZE = 26; // Inner size (28 - 2 for borders)
  const PADDING = 4;
  
  const centerX = (DICE_SIZE - DOT_SIZE) / 2;
  const centerY = (DICE_SIZE - DOT_SIZE) / 2;
  const leftX = PADDING;
  const rightX = DICE_SIZE - PADDING - DOT_SIZE;
  const topY = PADDING;
  const bottomY = DICE_SIZE - PADDING - DOT_SIZE;

  const dotPositions: { [key: number]: { x: number; y: number }[] } = {
    1: [{ x: centerX, y: centerY }],
    2: [{ x: leftX, y: topY }, { x: rightX, y: bottomY }],
    3: [{ x: leftX, y: topY }, { x: centerX, y: centerY }, { x: rightX, y: bottomY }],
    4: [{ x: leftX, y: topY }, { x: rightX, y: topY }, { x: leftX, y: bottomY }, { x: rightX, y: bottomY }],
    5: [{ x: leftX, y: topY }, { x: rightX, y: topY }, { x: centerX, y: centerY }, { x: leftX, y: bottomY }, { x: rightX, y: bottomY }],
    6: [{ x: leftX, y: topY }, { x: rightX, y: topY }, { x: leftX, y: centerY }, { x: rightX, y: centerY }, { x: leftX, y: bottomY }, { x: rightX, y: bottomY }],
  };

  return (
    <View style={styles.diceContainer}>
      {dotPositions[count]?.map((pos, idx) => (
        <View
          key={idx}
          style={[
            styles.diceDot,
            {
              position: 'absolute',
              left: pos.x,
              top: pos.y,
            },
          ]}
        />
      ))}
    </View>
  );
}

export default function YahtzeeScreen() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useLayoutDimensions();
  const isTablet = windowWidth >= TABLET_MIN_WIDTH;
  const router = useRouter();
  const { isFavorite, toggleFavorite } = useFavorites();
  const isSheetFavorite = isFavorite(SHEET_INFO.id);
  const { upsertActiveGame, clearActiveGame } = useActiveGames();

  const [upperScores, setUpperScores] = useState({
    aces: '',
    twos: '',
    threes: '',
    fours: '',
    fives: '',
    sixes: '',
  });

  const [lowerScores, setLowerScores] = useState({
    threeOfAKind: '',
    fourOfAKind: '',
    fullHouse: '',
    smStraight: '',
    lgStraight: '',
    yahtzee: '',
    chance: '',
  });

  const [yahtzeeBonuses, setYahtzeeBonuses] = useState([false, false, false]);

  useEffect(() => {
    const loadSaved = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!stored) return;

        const parsed = JSON.parse(stored) as {
          upperScores?: Partial<typeof upperScores>;
          lowerScores?: Partial<typeof lowerScores>;
          yahtzeeBonuses?: boolean[];
        };
        if (parsed.upperScores) {
          setUpperScores((prev) => ({ ...prev, ...parsed.upperScores }));
        }
        if (parsed.lowerScores) {
          setLowerScores((prev) => ({ ...prev, ...parsed.lowerScores }));
        }
        if (parsed.yahtzeeBonuses && parsed.yahtzeeBonuses.length === 3) {
          setYahtzeeBonuses(parsed.yahtzeeBonuses);
        }
      } catch (error) {
        console.error('Failed to load Yahtzee sheet:', error);
      }
    };

    void loadSaved();
  }, []);

  const [showCalculator, setShowCalculator] = useState(false);
  const [calcDisplay, setCalcDisplay] = useState('0');
  const [calcPrevValue, setCalcPrevValue] = useState<number | null>(null);
  const [calcOperator, setCalcOperator] = useState<string | null>(null);
  const [calcWaitingForOperand, setCalcWaitingForOperand] = useState(false);

  const upperTotal = Object.values(upperScores).reduce((sum, val) => {
    const num = parseInt(val, 10);
    return sum + (isNaN(num) ? 0 : num);
  }, 0);

  const bonus = upperTotal >= 63 ? 35 : 0;
  const upperTotalWithBonus = upperTotal + bonus;

  const lowerTotal = Object.values(lowerScores).reduce((sum, val) => {
    const num = parseInt(val, 10);
    return sum + (isNaN(num) ? 0 : num);
  }, 0);

  const yahtzeeBonus = yahtzeeBonuses.filter(Boolean).length * 100;
  const lowerTotalWithBonus = lowerTotal + yahtzeeBonus;

  const grandTotal = upperTotalWithBonus + lowerTotalWithBonus;

  const persistNow = async () => {
    const hasAnyScore =
      Object.values(upperScores).some((v) => v !== '') ||
      Object.values(lowerScores).some((v) => v !== '') ||
      yahtzeeBonuses.some(Boolean);

    if (hasAnyScore) {
      const payload = { upperScores, lowerScores, yahtzeeBonuses };
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

  const handleReset = async () => {
    setUpperScores({ aces: '', twos: '', threes: '', fours: '', fives: '', sixes: '' });
    setLowerScores({ threeOfAKind: '', fourOfAKind: '', fullHouse: '', smStraight: '', lgStraight: '', yahtzee: '', chance: '' });
    setYahtzeeBonuses([false, false, false]);

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
    <View style={[styles.screen, { paddingTop: insets.top + SCREEN_EXTRA_TOP_PADDING }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={iosKeyboardOffsetWithSafeTop(insets.top)}
      >
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => { void handleDone(); }}>
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
      <Text style={styles.title}>Yahtzee</Text>

      {/* Score Table */}
      <ScrollView
        style={styles.tableContainer}
        contentContainerStyle={[SCORE_SHEET_SCROLL_CONTENT, { paddingBottom: 24 }]}
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="interactive"
      >
        {/* Upper Section Header */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>Upper Section</Text>
          <Text style={styles.sectionHeaderText}>How to Score</Text>
        </View>

        {/* Upper Section Rows */}
        <View style={styles.tableRow}>
          <View style={styles.labelCell}>
            <Text style={styles.labelText}>ACES</Text>
            <DiceDots count={1} />
          </View>
          <View style={styles.descCell}>
            <Text style={styles.descText}>Count and Add Only Aces</Text>
          </View>
          <TextInput
            style={styles.scoreInput}
            value={upperScores.aces}
            onChangeText={(val) => setUpperScores((prev) => ({ ...prev, aces: val }))}
            keyboardType="number-pad"
            placeholder="—"
            placeholderTextColor="#CCC"
          />
        </View>

        <View style={styles.tableRow}>
          <View style={styles.labelCell}>
            <Text style={styles.labelText}>TWOS</Text>
            <DiceDots count={2} />
          </View>
          <View style={styles.descCell}>
            <Text style={styles.descText}>Count and Add Only Twos</Text>
          </View>
          <TextInput
            style={styles.scoreInput}
            value={upperScores.twos}
            onChangeText={(val) => setUpperScores((prev) => ({ ...prev, twos: val }))}
            keyboardType="number-pad"
            placeholder="—"
            placeholderTextColor="#CCC"
          />
        </View>

        <View style={styles.tableRow}>
          <View style={styles.labelCell}>
            <Text style={styles.labelText}>THREES</Text>
            <DiceDots count={3} />
          </View>
          <View style={styles.descCell}>
            <Text style={styles.descText}>Count and Add Only Threes</Text>
          </View>
          <TextInput
            style={styles.scoreInput}
            value={upperScores.threes}
            onChangeText={(val) => setUpperScores((prev) => ({ ...prev, threes: val }))}
            keyboardType="number-pad"
            placeholder="—"
            placeholderTextColor="#CCC"
          />
        </View>

        <View style={styles.tableRow}>
          <View style={styles.labelCell}>
            <Text style={styles.labelText}>FOURS</Text>
            <DiceDots count={4} />
          </View>
          <View style={styles.descCell}>
            <Text style={styles.descText}>Count and Add Only Fours</Text>
          </View>
          <TextInput
            style={styles.scoreInput}
            value={upperScores.fours}
            onChangeText={(val) => setUpperScores((prev) => ({ ...prev, fours: val }))}
            keyboardType="number-pad"
            placeholder="—"
            placeholderTextColor="#CCC"
          />
        </View>

        <View style={styles.tableRow}>
          <View style={styles.labelCell}>
            <Text style={styles.labelText}>FIVES</Text>
            <DiceDots count={5} />
          </View>
          <View style={styles.descCell}>
            <Text style={styles.descText}>Count and Add Only Fives</Text>
          </View>
          <TextInput
            style={styles.scoreInput}
            value={upperScores.fives}
            onChangeText={(val) => setUpperScores((prev) => ({ ...prev, fives: val }))}
            keyboardType="number-pad"
            placeholder="—"
            placeholderTextColor="#CCC"
          />
        </View>

        <View style={styles.tableRow}>
          <View style={styles.labelCell}>
            <Text style={styles.labelText}>SIXES</Text>
            <DiceDots count={6} />
          </View>
          <View style={styles.descCell}>
            <Text style={styles.descText}>Count and Add Only Sixes</Text>
          </View>
          <TextInput
            style={styles.scoreInput}
            value={upperScores.sixes}
            onChangeText={(val) => setUpperScores((prev) => ({ ...prev, sixes: val }))}
            keyboardType="number-pad"
            placeholder="—"
            placeholderTextColor="#CCC"
          />
        </View>

        <View style={styles.tableRow}>
          <View style={styles.labelCell}>
            <Text style={styles.totalLabelText}>Total Score</Text>
          </View>
          <View style={styles.descCell}>
            <Text style={styles.arrowText}>→</Text>
          </View>
          <View style={styles.totalValueCell}>
            <Text style={styles.totalValue}>{upperTotal}</Text>
          </View>
        </View>

        <View style={styles.tableRow}>
          <View style={styles.labelCell}>
            <Text style={styles.labelText}>Bonus</Text>
            <Text style={styles.subLabelText}>If total score is 63 or over</Text>
          </View>
          <View style={styles.descCell}>
            <Text style={styles.descText}>Score 35</Text>
          </View>
          <View style={styles.totalValueCell}>
            <Text style={styles.totalValue}>{bonus}</Text>
          </View>
        </View>

        <View style={styles.tableRow}>
          <View style={styles.labelCell}>
            <Text style={styles.totalLabelText}>Total</Text>
          </View>
          <View style={styles.descCell}>
            <Text style={styles.arrowText}>→</Text>
          </View>
          <View style={styles.totalValueCell}>
            <Text style={styles.totalValue}>{upperTotalWithBonus}</Text>
          </View>
        </View>

        {/* Lower Section Header */}
        <View style={[styles.sectionHeader, { marginTop: 16 }]}>
          <Text style={styles.sectionHeaderText}>Lower Section</Text>
          <Text style={styles.sectionHeaderText}></Text>
        </View>

        <View style={styles.tableRow}>
          <View style={styles.labelCell}>
            <Text style={styles.labelText}>3 of a kind</Text>
          </View>
          <View style={styles.descCell}>
            <Text style={styles.descText}>Add Total of All Dice</Text>
          </View>
          <TextInput
            style={styles.scoreInput}
            value={lowerScores.threeOfAKind}
            onChangeText={(val) => setLowerScores((prev) => ({ ...prev, threeOfAKind: val }))}
            keyboardType="number-pad"
            placeholder="—"
            placeholderTextColor="#CCC"
          />
        </View>

        <View style={styles.tableRow}>
          <View style={styles.labelCell}>
            <Text style={styles.labelText}>4 of a kind</Text>
          </View>
          <View style={styles.descCell}>
            <Text style={styles.descText}>Add Total of All Dice</Text>
          </View>
          <TextInput
            style={styles.scoreInput}
            value={lowerScores.fourOfAKind}
            onChangeText={(val) => setLowerScores((prev) => ({ ...prev, fourOfAKind: val }))}
            keyboardType="number-pad"
            placeholder="—"
            placeholderTextColor="#CCC"
          />
        </View>

        <View style={styles.tableRow}>
          <View style={styles.labelCell}>
            <Text style={styles.labelText}>Full House</Text>
          </View>
          <View style={styles.descCell}>
            <Text style={styles.descText}>SCORE 25</Text>
          </View>
          <TextInput
            style={styles.scoreInput}
            value={lowerScores.fullHouse}
            onChangeText={(val) => setLowerScores((prev) => ({ ...prev, fullHouse: val }))}
            keyboardType="number-pad"
            placeholder="—"
            placeholderTextColor="#CCC"
          />
        </View>

        <View style={styles.tableRow}>
          <View style={styles.labelCell}>
            <Text style={styles.labelText}>Sm. Straight</Text>
          </View>
          <View style={styles.descCell}>
            <Text style={styles.descText}>SCORE 30</Text>
          </View>
          <TextInput
            style={styles.scoreInput}
            value={lowerScores.smStraight}
            onChangeText={(val) => setLowerScores((prev) => ({ ...prev, smStraight: val }))}
            keyboardType="number-pad"
            placeholder="—"
            placeholderTextColor="#CCC"
          />
        </View>

        <View style={styles.tableRow}>
          <View style={styles.labelCell}>
            <Text style={styles.labelText}>Lg. Straight</Text>
          </View>
          <View style={styles.descCell}>
            <Text style={styles.descText}>SCORE 40</Text>
          </View>
          <TextInput
            style={styles.scoreInput}
            value={lowerScores.lgStraight}
            onChangeText={(val) => setLowerScores((prev) => ({ ...prev, lgStraight: val }))}
            keyboardType="number-pad"
            placeholder="—"
            placeholderTextColor="#CCC"
          />
        </View>

        <View style={styles.tableRow}>
          <View style={styles.labelCell}>
            <Text style={styles.labelText}>YAHTZEE</Text>
          </View>
          <View style={styles.descCell}>
            <Text style={styles.descText}>SCORE 50</Text>
          </View>
          <TextInput
            style={styles.scoreInput}
            value={lowerScores.yahtzee}
            onChangeText={(val) => setLowerScores((prev) => ({ ...prev, yahtzee: val }))}
            keyboardType="number-pad"
            placeholder="—"
            placeholderTextColor="#CCC"
          />
        </View>

        <View style={styles.tableRow}>
          <View style={styles.labelCell}>
            <Text style={styles.labelText}>Chance</Text>
          </View>
          <View style={styles.descCell}>
            <Text style={styles.descText}>Add Total of All Dice</Text>
          </View>
          <TextInput
            style={styles.scoreInput}
            value={lowerScores.chance}
            onChangeText={(val) => setLowerScores((prev) => ({ ...prev, chance: val }))}
            keyboardType="number-pad"
            placeholder="—"
            placeholderTextColor="#CCC"
          />
        </View>

        <View style={styles.tableRow}>
          <View style={styles.labelCell}>
            <Text style={styles.labelText}>YAHTZEE</Text>
            <Text style={styles.labelText}>BONUS</Text>
          </View>
          <View style={styles.descCell}>
            <Text style={styles.descText}>Score 100 per ✓</Text>
          </View>
          <View style={styles.checkboxRow}>
            {yahtzeeBonuses.map((checked, idx) => (
              <Pressable
                key={idx}
                style={[styles.checkbox, checked && styles.checkboxChecked]}
                onPress={() => {
                  setYahtzeeBonuses((prev) => {
                    const updated = [...prev];
                    updated[idx] = !updated[idx];
                    return updated;
                  });
                }}
              >
                {checked && <Text style={styles.checkmark}>✓</Text>}
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.tableRow}>
          <View style={styles.labelCell}>
            <Text style={styles.labelText}>Total</Text>
            <Text style={styles.subLabelText}>Of Lower Section</Text>
          </View>
          <View style={styles.descCell}>
            <Text style={styles.arrowText}>→</Text>
          </View>
          <View style={styles.totalValueCell}>
            <Text style={styles.totalValue}>{lowerTotalWithBonus}</Text>
          </View>
        </View>

        <View style={styles.tableRow}>
          <View style={styles.labelCell}>
            <Text style={styles.labelText}>Total</Text>
            <Text style={styles.subLabelText}>Of Upper Section</Text>
          </View>
          <View style={styles.descCell}>
            <Text style={styles.arrowText}>→</Text>
          </View>
          <View style={styles.totalValueCell}>
            <Text style={styles.totalValue}>{upperTotalWithBonus}</Text>
          </View>
        </View>

        <View style={[styles.tableRow, { borderBottomWidth: 0 }]}>
          <View style={styles.labelCell}>
            <Text style={styles.totalLabelText}>Grand Total</Text>
          </View>
          <View style={styles.descCell}>
            <Text style={styles.arrowText}>→</Text>
          </View>
          <View style={styles.totalValueCell}>
            <Text style={styles.grandTotalValue}>{grandTotal}</Text>
          </View>
        </View>

        <View style={{ height: 20 }} />

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
  sectionHeader: {
    flexDirection: 'row',
    backgroundColor: Colors.light.primary,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 4,
    marginBottom: 4,
  },
  sectionHeaderText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
    paddingVertical: 10,
    minHeight: 50,
  },
  labelCell: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  labelText: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.dark.background,
  },
  subLabelText: {
    fontSize: 9,
    color: '#666',
    width: '100%',
  },
  totalLabelText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.dark.background,
  },
  descCell: {
    flex: 1.5,
    paddingHorizontal: 8,
  },
  descText: {
    fontSize: 11,
    color: '#666',
    textAlign: 'center',
  },
  arrowText: {
    fontSize: 20,
    color: Colors.dark.background,
    textAlign: 'center',
  },
  scoreInput: {
    width: 50,
    height: 36,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 6,
    textAlign: 'center',
    fontSize: 14,
    color: Colors.dark.background,
  },
  totalValueCell: {
    width: 50,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  totalValue: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.dark.background,
  },
  grandTotalValue: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.dark.background,
  },
  checkboxRow: {
    flexDirection: 'row',
    gap: 8,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderWidth: 1,
    borderColor: '#CCC',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: Colors.light.primary,
    borderColor: Colors.light.primary,
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  diceContainer: {
    width: 28,
    height: 28,
    borderWidth: 1,
    borderColor: Colors.dark.background,
    borderRadius: 4,
    position: 'relative',
  },
  diceDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: Colors.dark.background,
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
