import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, TABLET_MIN_WIDTH } from '@/constants/theme';
import { useLastScoreSheet, withNoAnimationHref } from '@/context/last-score-sheet-context';
import { useLayoutDimensions } from '@/hooks/use-layout-dimensions';

const ICONS: Record<string, any> = {
  rulebook: require('@/assets/icons/rulebook-open.svg'),
  'score-sheets': require('@/assets/icons/score-sheets.svg'),
  index: require('@/assets/icons/home.svg'),
  timers: require('@/assets/icons/clock.svg'),
  dice: require('@/assets/icons/dice.svg'),
};

const LABELS: Record<string, string> = {
  rulebook: 'Rules',
  'score-sheets': 'Scoring',
  index: 'Home',
  timers: 'Timers',
  dice: 'Dice',
};

export function BottomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { lastScoreSheetHref } = useLastScoreSheet();
  const { width: windowWidth } = useLayoutDimensions();
  const isTablet = windowWidth >= TABLET_MIN_WIDTH;
  const rawActiveRouteName = state.routes[state.index]?.name;
  const scoreSheetRoutes = [
    'mexican-train',
    'yahtzee',
    'wizard',
    'clue',
    'scrabble',
    'five-crowns',
    'scattergories',
    'hand-and-foot',
    'rook',
    'custom-score-sheet',
  ] as const;

  const isOnScoreSheet = scoreSheetRoutes.includes(rawActiveRouteName as any);

  // Keep "Scoring" highlighted while user is on any score-sheet screen.
  const activeRouteName = isOnScoreSheet ? 'score-sheets' : rawActiveRouteName;
  const allowedRouteNames = ['rulebook', 'score-sheets', 'index', 'timers', 'dice'] as const;
  const visibleRoutes = allowedRouteNames
    .map((name) => state.routes.find((r) => r.name === name))
    .filter(Boolean) as typeof state.routes;

  return (
    <View style={[styles.wrapper, isTablet && styles.wrapperTablet]}>
      <View style={[styles.container, isTablet && styles.containerTablet]}>
        {visibleRoutes.map((route) => {
          const isFocused = route.name === activeRouteName;
          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (event.defaultPrevented) return;

            // On an individual score sheet (stack screen): Scoring opens the grid to pick another game.
            if (route.name === 'score-sheets' && isOnScoreSheet) {
              navigation.navigate('score-sheets' as any);
              return;
            }

            // From Home / Rules / Timers / Dice: return to the last open score sheet if any.
            if (route.name === 'score-sheets' && !isFocused) {
              if (lastScoreSheetHref) {
                router.push(withNoAnimationHref(lastScoreSheetHref) as any);
              } else {
                navigation.navigate('score-sheets' as any);
              }
              return;
            }

            if (!isFocused) {
              navigation.navigate(route.name);
            }
          };

          const iconSource = ICONS[route.name];
          const label = LABELS[route.name] ?? route.name;
          const iconColor = isFocused ? Colors.light.secondary : Colors.light.surface;
          const labelColor = isFocused ? Colors.light.secondary : Colors.light.surface;

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              style={({ pressed }) => [
                styles.tab,
                isTablet && styles.tabTablet,
                pressed && { opacity: 0.7 },
              ]}
              onPress={onPress}>
              <View style={[styles.iconLabelBubble, isTablet && styles.iconLabelBubbleTablet]}>
                {iconSource && (
                  <Image
                    source={iconSource}
                    style={styles.icon}
                    tintColor={iconColor}
                    contentFit="contain"
                  />
                )}
                <ThemedText
                  numberOfLines={1}
                  style={[styles.label, { color: labelColor }]}>
                  {label}
                </ThemedText>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 16,
    backgroundColor: 'transparent',
  },
  wrapperTablet: {
    paddingHorizontal: 80,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.dark.background,
    borderRadius: 50,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  containerTablet: {
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 10,
    alignSelf: 'center',
    maxWidth: 600,
    width: '100%',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabTablet: {
    flex: 1,
    minWidth: 48,
  },
  iconLabelBubble: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  iconLabelBubbleTablet: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  icon: {
    width: 24,
    height: 24,
  },
  label: {
    fontSize: 10,
    maxWidth: 72,
    textAlign: 'center',
  },
});

