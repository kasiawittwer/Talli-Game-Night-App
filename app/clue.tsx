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

const SUSPECTS = [
  'Colonel Mustard',
  'Professor Plum',
  'Mr. Green',
  'Mrs. Peacock',
  'Miss Scarlet',
  'Mrs. White',
];

const WEAPONS = [
  'Knife',
  'Candle Stick',
  'Revolver',
  'Rope',
  'Lead Pipe',
  'Wrench',
];

const ROOMS = [
  'Ballroom',
  'Billiard Room',
  'Conservatory',
  'Dining Room',
  'Hall',
  'Kitchen',
  'Library',
  'Lounge',
  'Study',
];

const SHEET_INFO = {
  id: 'clue',
  name: 'Clue',
  color: Colors.light.secondary,
  route: '/clue',
};

const STORAGE_KEY = '@sheet:clue';

type MarkingsState = {
  suspects: boolean[];
  weapons: boolean[];
  rooms: boolean[];
};

type ClueItemsState = {
  suspects: string[];
  weapons: string[];
  rooms: string[];
};

export default function ClueScreen() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useLayoutDimensions();
  const isTablet = windowWidth >= TABLET_MIN_WIDTH;
  const router = useRouter();
  const { isFavorite, toggleFavorite } = useFavorites();
  const isSheetFavorite = isFavorite(SHEET_INFO.id);
  const { upsertActiveGame, clearActiveGame } = useActiveGames();

  const defaultItems: ClueItemsState = {
    suspects: SUSPECTS,
    weapons: WEAPONS,
    rooms: ROOMS,
  };
  const makeDefaultMarkings = (): MarkingsState => ({
    suspects: defaultItems.suspects.map(() => false),
    weapons: defaultItems.weapons.map(() => false),
    rooms: defaultItems.rooms.map(() => false),
  });
  const normalizeItems = (raw?: Partial<ClueItemsState> | null): ClueItemsState => ({
    suspects: defaultItems.suspects.map((v, i) => raw?.suspects?.[i] ?? v),
    weapons: defaultItems.weapons.map((v, i) => raw?.weapons?.[i] ?? v),
    rooms: defaultItems.rooms.map((v, i) => raw?.rooms?.[i] ?? v),
  });
  const normalizeMarkings = (raw?: Partial<MarkingsState> | null): MarkingsState => {
    const defaults = makeDefaultMarkings();
    return {
      suspects: defaults.suspects.map((v, i) => raw?.suspects?.[i] ?? v),
      weapons: defaults.weapons.map((v, i) => raw?.weapons?.[i] ?? v),
      rooms: defaults.rooms.map((v, i) => raw?.rooms?.[i] ?? v),
    };
  };

  const [items, setItems] = useState<ClueItemsState>(defaultItems);
  const [markings, setMarkings] = useState<MarkingsState>({
    suspects: SUSPECTS.map(() => false),
    weapons: WEAPONS.map(() => false),
    rooms: ROOMS.map(() => false),
  });

  useEffect(() => {
    const loadSaved = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!stored) return;
        const parsed = JSON.parse(stored) as { markings?: MarkingsState; items?: ClueItemsState };
        setItems(normalizeItems(parsed.items));
        if (parsed.markings) {
          setMarkings(normalizeMarkings(parsed.markings));
        }
      } catch (error) {
        console.error('Failed to load Clue sheet:', error);
      }
    };

    void loadSaved();
  }, []);

  const [showCalculator, setShowCalculator] = useState(false);
  const [calcDisplay, setCalcDisplay] = useState('0');
  const [calcPrevValue, setCalcPrevValue] = useState<number | null>(null);
  const [calcOperator, setCalcOperator] = useState<string | null>(null);
  const [calcWaitingForOperand, setCalcWaitingForOperand] = useState(false);

  const toggleMarking = (
    category: 'suspects' | 'weapons' | 'rooms',
    rowIndex: number
  ) => {
    setMarkings((prev) => {
      const updated = { ...prev };
      updated[category] = [...prev[category]];
      updated[category][rowIndex] = !updated[category][rowIndex];
      return updated;
    });
  };

  const persistNow = async () => {
    const isItemsCustomized = (
      items.suspects.some((name, i) => name !== defaultItems.suspects[i]) ||
      items.weapons.some((name, i) => name !== defaultItems.weapons[i]) ||
      items.rooms.some((name, i) => name !== defaultItems.rooms[i])
    );
    const hasAny = markings.suspects.some(Boolean) || markings.weapons.some(Boolean) || markings.rooms.some(Boolean);

    if (hasAny || isItemsCustomized) {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ markings, items }));
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
    setItems(defaultItems);
    setMarkings(makeDefaultMarkings());

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

  const renderSection = (
    title: string,
    sectionItems: string[],
    category: 'suspects' | 'weapons' | 'rooms'
  ) => (
    <>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionHeaderText}>{title}</Text>
        <View style={styles.sectionHeaderColumn} />
      </View>
      {sectionItems.map((item, rowIdx) => (
        <View key={`${category}-${rowIdx}`} style={styles.itemRow}>
          <View style={styles.itemNameCell}>
            <TextInput
              style={[
                styles.itemNameInput,
                markings[category][rowIdx] && styles.itemNameChecked,
              ]}
              value={item}
              onChangeText={(nextLabel) =>
                setItems((prev) => {
                  const updated = { ...prev };
                  updated[category] = [...prev[category]];
                  updated[category][rowIdx] = nextLabel;
                  return updated;
                })
              }
              placeholderTextColor="#999"
            />
          </View>
          <Pressable
            style={styles.checkboxCell}
            onPress={() => toggleMarking(category, rowIdx)}
          >
            <View
              style={[
                styles.checkbox,
                markings[category][rowIdx] && styles.checkboxChecked,
              ]}
            >
              {markings[category][rowIdx] && (
                <Text style={styles.checkmark}>✓</Text>
              )}
            </View>
          </Pressable>
        </View>
      ))}
    </>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top + SCREEN_EXTRA_TOP_PADDING }]}>
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
      <Text style={styles.title}>Clue</Text>

      {/* Score Table */}
      <ScrollView
        style={styles.tableContainer}
        contentContainerStyle={[SCORE_SHEET_SCROLL_CONTENT, { paddingBottom: 24 }]}
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <View style={styles.table}>
          {renderSection('Suspects', items.suspects, 'suspects')}
          {renderSection('Weapons', items.weapons, 'weapons')}
          {renderSection('Rooms', items.rooms, 'rooms')}
        </View>

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
  table: {
    borderWidth: 1,
    borderColor: '#000',
  },
  sectionHeader: {
    flexDirection: 'row',
    backgroundColor: Colors.light.secondary,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
  },
  sectionHeaderText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.dark.background,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  sectionHeaderColumn: {
    width: 50,
    borderLeftWidth: 1,
    borderLeftColor: '#000',
  },
  itemRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#DDD',
  },
  itemNameCell: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  itemName: {
    fontSize: 14,
    color: Colors.dark.background,
  },
  itemNameInput: {
    fontSize: 14,
    color: Colors.dark.background,
    minHeight: 32,
    paddingVertical: 2,
  },
  itemNameChecked: {
    textDecorationLine: 'line-through',
    color: '#999',
  },
  checkboxCell: {
    width: 50,
    borderLeftWidth: 1,
    borderLeftColor: '#DDD',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#CCC',
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
