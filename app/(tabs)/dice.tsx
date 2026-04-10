import { Image } from 'expo-image';
import { useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Fonts, TABLET_MIN_WIDTH } from '@/constants/theme';

type DicePage = 0 | 1 | 2;

export default function DiceScreen() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const isTablet = windowWidth >= TABLET_MIN_WIDTH;
  const dieSize = isTablet ? 300 : 200;
  const pipGridSize = Math.round((dieSize * 120) / 180);
  const pipDotSize = Math.round((dieSize * 18) / 180);
  const dieBorderRadius = Math.round((dieSize * 24) / 180);
  const alphaDieSize = isTablet ? 320 : 220;
  const alphaLetterSize = isTablet ? 100 : 72;

  const scrollRef = useRef<ScrollView | null>(null);
  const [pageIndex, setPageIndex] = useState<DicePage>(0);
  const [pageWidth, setPageWidth] = useState(() => Dimensions.get('window').width);

  const [singleDie, setSingleDie] = useState(1);
  const [pairDice, setPairDice] = useState<[number, number]>([1, 1]);
  const [alphaDie, setAlphaDie] = useState('A');

  const rollRotation = useRef(new Animated.Value(0)).current;
  const rollScale = useRef(new Animated.Value(1)).current;
  const pairRotation0 = useRef(new Animated.Value(0)).current;
  const pairScale0 = useRef(new Animated.Value(1)).current;
  const pairRotation1 = useRef(new Animated.Value(0)).current;
  const pairScale1 = useRef(new Animated.Value(1)).current;
  const rollAnimRunning = useRef<Animated.CompositeAnimation | null>(null);

  const playPairDiceAnimation = () => {
    pairRotation0.setValue(0);
    pairScale0.setValue(1);
    pairRotation1.setValue(0);
    pairScale1.setValue(1);

    const staggerMs = 55;
    const spinMs = 400;

    const die0 = Animated.parallel([
      Animated.timing(pairRotation0, {
        toValue: 1,
        duration: spinMs,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(pairScale0, {
          toValue: 0.9,
          duration: 85,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(pairScale0, {
          toValue: 1,
          friction: 6,
          tension: 220,
          useNativeDriver: true,
        }),
      ]),
    ]);

    const die1 = Animated.parallel([
      Animated.sequence([
        Animated.delay(staggerMs),
        Animated.timing(pairRotation1, {
          toValue: 1,
          duration: spinMs,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.delay(staggerMs),
        Animated.timing(pairScale1, {
          toValue: 0.9,
          duration: 85,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(pairScale1, {
          toValue: 1,
          friction: 6,
          tension: 220,
          useNativeDriver: true,
        }),
      ]),
    ]);

    const anim = Animated.parallel([die0, die1]);
    rollAnimRunning.current = anim;
    anim.start(({ finished }) => {
      if (finished) rollAnimRunning.current = null;
    });
  };

  const playRollAnimation = () => {
    rollAnimRunning.current?.stop();
    if (pageIndex === 1) {
      playPairDiceAnimation();
      return;
    }
    rollRotation.setValue(0);
    rollScale.setValue(1);
    const anim = Animated.parallel([
      Animated.timing(rollRotation, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(rollScale, {
          toValue: 0.9,
          duration: 90,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(rollScale, {
          toValue: 1,
          friction: 6,
          tension: 220,
          useNativeDriver: true,
        }),
      ]),
    ]);
    rollAnimRunning.current = anim;
    anim.start(({ finished }) => {
      if (finished) rollAnimRunning.current = null;
    });
  };

  const rollSpin = rollRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '720deg'],
  });

  const pairSpin0 = pairRotation0.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '720deg'],
  });
  const pairSpin1 = pairRotation1.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-720deg'],
  });

  const rollAnimStyle = {
    transform: [{ rotate: rollSpin }, { scale: rollScale }],
  };
  const pairAnimStyle0 = {
    transform: [{ rotate: pairSpin0 }, { scale: pairScale0 }],
  };
  const pairAnimStyle1 = {
    transform: [{ rotate: pairSpin1 }, { scale: pairScale1 }],
  };

  const onScrollViewLayout = (e: LayoutChangeEvent) => {
    setPageWidth(e.nativeEvent.layout.width);
  };

  const handleScrollEnd = (e: any) => {
    const { contentOffset, layoutMeasurement } = e.nativeEvent;
    const index = Math.round(contentOffset.x / layoutMeasurement.width) as DicePage;
    setPageIndex(index);
  };

  const roll = () => {
    playRollAnimation();
    if (pageIndex === 0) {
      setSingleDie(1 + Math.floor(Math.random() * 6));
    } else if (pageIndex === 1) {
      setPairDice([
        1 + Math.floor(Math.random() * 6),
        1 + Math.floor(Math.random() * 6),
      ]);
    } else {
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const idx = Math.floor(Math.random() * alphabet.length);
      setAlphaDie(alphabet[idx]);
    }
  };

  const dieSquareStyle = {
    width: dieSize,
    height: dieSize,
    borderRadius: dieBorderRadius,
  };

  return (
    <ThemedView style={[styles.screen, isTablet && styles.screenTablet, { paddingTop: insets.top }]}>
      <View style={[styles.contentColumn, isTablet && styles.contentColumnTablet]}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onLayout={onScrollViewLayout}
          onMomentumScrollEnd={handleScrollEnd}
          style={styles.scrollView}>
          {/* Dice 1: single six-sided die (blue) */}
          <View style={[styles.page, { width: pageWidth }]}>
            <Pressable onPress={roll} hitSlop={12}>
              <Animated.View style={rollAnimStyle}>
                <View style={[styles.dieSquare, dieSquareStyle, { backgroundColor: Colors.light.secondary }]}>
                  <Pips value={singleDie} pipGridSize={pipGridSize} pipDotSize={pipDotSize} />
                </View>
              </Animated.View>
            </Pressable>
          </View>

          {/* Dice 2: two six-sided dice (yellow + blue) — each die animates on its own pivot */}
          <View style={[styles.page, { width: pageWidth }]}>
            <Pressable onPress={roll} hitSlop={12}>
              <View style={[styles.twoDiceColumn, isTablet && styles.twoDiceColumnTablet]}>
                <Animated.View style={pairAnimStyle0}>
                  <View style={[styles.dieSquare, dieSquareStyle, { backgroundColor: Colors.light.accent }]}>
                    <Pips value={pairDice[0]} pipGridSize={pipGridSize} pipDotSize={pipDotSize} />
                  </View>
                </Animated.View>
                <Animated.View style={pairAnimStyle1}>
                  <View style={[styles.dieSquare, dieSquareStyle, { backgroundColor: Colors.light.secondary }]}>
                    <Pips value={pairDice[1]} pipGridSize={pipGridSize} pipDotSize={pipDotSize} />
                  </View>
                </Animated.View>
              </View>
            </Pressable>
          </View>

          {/* Dice 3: alphabet die */}
          <View style={[styles.page, { width: pageWidth }]}>
            <Pressable onPress={roll} hitSlop={12}>
              <View style={styles.alphaWrapper}>
                <Animated.View
                  style={[
                    styles.alphaDie,
                    { width: alphaDieSize, height: alphaDieSize },
                    rollAnimStyle,
                  ]}>
                  <Image
                    source={require('@/assets/Polygon 1.svg')}
                    style={styles.alphaImage}
                    contentFit="contain"
                  />
                  <Text style={[styles.alphaLetter, { fontSize: alphaLetterSize }]}>{alphaDie}</Text>
                </Animated.View>
              </View>
            </Pressable>
          </View>
        </ScrollView>

        <View style={[styles.bottomSection, isTablet && styles.bottomSectionTablet]}>
          <View style={[styles.dotsRow, isTablet && styles.dotsRowTablet]}>
            <View
              style={[
                styles.dot,
                { backgroundColor: pageIndex === 0 ? Colors.light.primary : '#D0D0D0' },
              ]}
            />
            <View
              style={[
                styles.dot,
                { backgroundColor: pageIndex === 1 ? Colors.light.primary : '#D0D0D0' },
              ]}
            />
            <View
              style={[
                styles.dot,
                { backgroundColor: pageIndex === 2 ? Colors.light.primary : '#D0D0D0' },
              ]}
            />
          </View>

          <View style={styles.rollRow}>
            <Pressable style={styles.rollButton} onPress={roll}>
              <ThemedText style={styles.rollText}>Roll</ThemedText>
            </Pressable>
          </View>
        </View>
      </View>
    </ThemedView>
  );
}

function Pips({
  value,
  pipGridSize,
  pipDotSize,
}: {
  value: number;
  pipGridSize: number;
  pipDotSize: number;
}) {
  const layout: boolean[][] = [
    [value >= 4, value === 6, value >= 2],
    [false, value % 2 === 1, false],
    [value >= 2, value === 6, value >= 4],
  ];
  const pipRadius = pipDotSize / 2;

  return (
    <View style={[styles.pipGrid, { width: pipGridSize, height: pipGridSize }]}>
      {layout.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.pipRow}>
          {row.map((on, colIndex) => (
            <View
              key={colIndex}
              style={[
                styles.pipDot,
                {
                  width: pipDotSize,
                  height: pipDotSize,
                  borderRadius: pipRadius,
                  opacity: on ? 1 : 0,
                },
              ]}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingBottom: 24,
  },
  screenTablet: {
    paddingHorizontal: 96,
    paddingBottom: 72,
  },
  contentColumn: {
    flex: 1,
    width: '100%',
  },
  contentColumnTablet: {
    maxWidth: 900,
    alignSelf: 'center',
  },
  scrollView: {
    flex: 1,
  },
  bottomSection: {
    paddingHorizontal: 24,
  },
  bottomSectionTablet: {
    paddingHorizontal: 0,
  },
  page: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dieSquare: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pipGrid: {
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  pipRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  pipDot: {
    backgroundColor: '#FFFFFF',
  },
  twoDiceColumn: {
    gap: 24,
    alignItems: 'center',
  },
  twoDiceColumnTablet: {
    gap: 36,
  },
  alphaWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  alphaDie: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  alphaImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  alphaLetter: {
    color: '#FFFFFF',
    fontFamily: Fonts.gameTitle, // Aquavit Talli for the letter faces
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    marginBottom: 48,
  },
  dotsRowTablet: {
    marginTop: 20,
    marginBottom: 28,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  rollRow: {
    alignItems: 'center',
  },
  rollButton: {
    paddingHorizontal: 40,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: Colors.light.primary,
  },
  rollText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
});


