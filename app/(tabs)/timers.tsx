import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';

const CIRCLE_SIZE = 260;
const STROKE_WIDTH = 16;
const RADIUS = (CIRCLE_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

type Mode = 'countdown' | 'stopwatch';

export default function TimersScreen() {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView | null>(null);
  const [pageWidth, setPageWidth] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);

  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(0);
  const [seconds, setSeconds] = useState(0);

  const [mode, setMode] = useState<Mode>('countdown');
  const [isRunning, setIsRunning] = useState(false);
  const [remainingMs, setRemainingMs] = useState(0);
  const [initialMs, setInitialMs] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);

  // Timer / stopwatch tick
  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      if (mode === 'countdown') {
        setRemainingMs((prev) => {
          if (prev <= 1000) {
            setIsRunning(false);
            return 0;
          }
          return prev - 1000;
        });
      } else {
        setElapsedMs((prev) => prev + 100);
      }
    }, mode === 'countdown' ? 1000 : 100);

    return () => clearInterval(interval);
  }, [isRunning, mode]);

  // When page changes, update mode
  useEffect(() => {
    setMode(pageIndex === 0 ? 'countdown' : 'stopwatch');
    setIsRunning(false);
  }, [pageIndex]);

  const onLayoutPage = (e: LayoutChangeEvent) => {
    setPageWidth(e.nativeEvent.layout.width);
  };

  const handleScrollEnd = (e: any) => {
    const x = e.nativeEvent.contentOffset.x;
    if (pageWidth > 0) {
      const index = Math.round(x / pageWidth);
      setPageIndex(index);
    }
  };

  const formatCountdown = () => {
    const total = remainingMs;
    const h = Math.floor(total / 3600000);
    const m = Math.floor((total % 3600000) / 60000);
    const s = Math.floor((total % 60000) / 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(
      s
    ).padStart(2, '0')}`;
  };

  const formatStopwatch = () => {
    const total = elapsedMs;
    const m = Math.floor(total / 60000);
    const s = Math.floor((total % 60000) / 1000);
    const cs = Math.floor((total % 1000) / 10); // centiseconds
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(
      2,
      '0'
    )}`;
  };

  const handleStartStop = () => {
    if (isRunning) {
      setIsRunning(false);
      return;
    }

    if (mode === 'countdown') {
      if (remainingMs === 0) {
        const totalMs = (hours * 3600 + minutes * 60 + seconds) * 1000;
        if (totalMs <= 0) return;
        setRemainingMs(totalMs);
        setInitialMs(totalMs);
      }
    }

    setIsRunning(true);
  };

  const handleReset = () => {
    setIsRunning(false);
    setRemainingMs(0);
    setInitialMs(0);
    setElapsedMs(0);
  };

  const progress = initialMs > 0 ? remainingMs / initialMs : 1;
  const strokeDashoffset = CIRCUMFERENCE * (1 - progress);

  const adjustUnit = (unit: 'hours' | 'minutes' | 'seconds', delta: number) => {
    if (isRunning) return;
    if (unit === 'hours') {
      setHours((prev) => Math.max(0, Math.min(23, prev + delta)));
    } else if (unit === 'minutes') {
      setMinutes((prev) => {
        const next = prev + delta;
        if (next > 59) return 0;
        if (next < 0) return 59;
        return next;
      });
    } else {
      setSeconds((prev) => {
        const next = prev + delta;
        if (next > 59) return 0;
        if (next < 0) return 59;
        return next;
      });
    }
  };

  return (
    <ThemedView style={styles.screen}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onLayout={onLayoutPage}
        onMomentumScrollEnd={handleScrollEnd}
        contentContainerStyle={{ paddingTop: insets.top + 16 }}>
        {/* PAGE 1: Countdown timer */}
        <View style={[styles.page, { width: pageWidth || '100%' }]}>
          <View style={styles.timeControlsRow}>
            <TimeBlock
              label="Hours"
              value={hours}
              onIncrement={() => adjustUnit('hours', 1)}
              onDecrement={() => adjustUnit('hours', -1)}
            />
            <TimeBlock
              label="Minutes"
              value={minutes}
              onIncrement={() => adjustUnit('minutes', 1)}
              onDecrement={() => adjustUnit('minutes', -1)}
            />
            <TimeBlock
              label="Seconds"
              value={seconds}
              onIncrement={() => adjustUnit('seconds', 1)}
              onDecrement={() => adjustUnit('seconds', -1)}
            />
          </View>

          <View style={styles.circleWrapper}>
            <Svg width={CIRCLE_SIZE} height={CIRCLE_SIZE}>
              {/* Background circle (50% tint - lighter) */}
              <Circle
                cx={CIRCLE_SIZE / 2}
                cy={CIRCLE_SIZE / 2}
                r={RADIUS}
                stroke={`${Colors.light.primary}80`}
                strokeWidth={STROKE_WIDTH}
                fill="transparent"
              />
              {/* Progress circle (solid orange) */}
              <Circle
                cx={CIRCLE_SIZE / 2}
                cy={CIRCLE_SIZE / 2}
                r={RADIUS}
                stroke={Colors.light.primary}
                strokeWidth={STROKE_WIDTH}
                fill="transparent"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                transform={`rotate(-90 ${CIRCLE_SIZE / 2} ${CIRCLE_SIZE / 2})`}
              />
            </Svg>
            <View style={styles.circleTimeContainer}>
              <Text style={styles.circleTime}>
                {remainingMs > 0 ? formatCountdown() : '00:00'}
              </Text>
            </View>
          </View>
        </View>

        {/* PAGE 2: Stopwatch */}
        <View style={[styles.page, { width: pageWidth || '100%' }]}>
          <View style={styles.stopwatchCenter}>
            <Text style={styles.stopwatchTime}>{formatStopwatch()}</Text>
          </View>
        </View>
      </ScrollView>

      {/* Pagination dots */}
      <View style={styles.dotsRow}>
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
      </View>

      {/* Controls */}
      <View style={styles.bottomButtonsRow}>
        <Pressable style={styles.resetButton} onPress={handleReset}>
          <ThemedText style={styles.resetText}>Reset</ThemedText>
        </Pressable>
        <Pressable style={styles.startButton} onPress={handleStartStop}>
          <ThemedText style={styles.startText}>{isRunning ? 'Stop' : 'Start'}</ThemedText>
        </Pressable>
      </View>
    </ThemedView>
  );
}

type TimeBlockProps = {
  label: string;
  value: number;
  onIncrement: () => void;
  onDecrement: () => void;
};

function TimeBlock({ label, value, onIncrement, onDecrement }: TimeBlockProps) {
  return (
    <View style={styles.timeBlock}>
      <Pressable
        style={({ pressed }) => [styles.arrowButton, pressed && styles.arrowPressed]}
        onPress={onIncrement}
      >
        <View style={styles.arrowIconWrap}>
          <View style={{ transform: [{ rotate: '-90deg' }] }}>
            <Image
              source={require('@/assets/icons/chevron-right.svg')}
              style={styles.arrowIcon}
              contentFit="contain"
            />
          </View>
        </View>
      </Pressable>

      <View style={styles.valueContainer}>
        <Text style={styles.timeBlockValue}>{value}</Text>
        <Text style={styles.timeBlockLabel}>{label}</Text>
      </View>

      <Pressable
        style={({ pressed }) => [styles.arrowButton, pressed && styles.arrowPressed]}
        onPress={onDecrement}
      >
        <View style={styles.arrowIconWrap}>
          <View style={{ transform: [{ rotate: '90deg' }] }}>
            <Image
              source={require('@/assets/icons/chevron-right.svg')}
              style={styles.arrowIcon}
              contentFit="contain"
            />
          </View>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  page: {
    flex: 1,
    alignItems: 'center',
  },
  timeControlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 24,
  },
  timeBlock: {
    flex: 1,
    marginHorizontal: 3,
    backgroundColor: Colors.dark.background,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 96,
  },
  arrowButton: {
    paddingVertical: 5,
    paddingHorizontal: 14,
  },
  arrowPressed: {
    opacity: 0.5,
  },
  arrowIconWrap: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowIcon: {
    width: 16,
    height: 16,
  },
  valueContainer: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  timeBlockValue: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '600',
  },
  timeBlockLabel: {
    color: '#AAAAAA',
    fontSize: 11,
    marginTop: 2,
  },
  circleWrapper: {
    marginTop: 70,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  circleTimeContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleTime: {
    fontSize: 36,
    color: Colors.light.primary,
  },
  stopwatchCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopwatchTime: {
    fontSize: 52,
    color: Colors.light.primary,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    marginBottom: 48,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  bottomButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  resetButton: {
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: Colors.dark.background,
  },
  resetText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  startButton: {
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: Colors.light.primary,
  },
  startText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
});

