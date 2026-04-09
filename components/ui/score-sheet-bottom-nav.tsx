import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';

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

export function ScoreSheetBottomNav() {
  const router = useRouter();

  const withNoAnimation = (href: string) => {
    const sep = href.includes('?') ? '&' : '?';
    return `${href}${sep}__internal_expo_router_no_animation=true`;
  };

  const navigateToTab = (routePath: string) => {
    router.replace(withNoAnimation(routePath) as any);
  };

  const onScoringPress = () => {
    // User is on a score sheet; tapping Scoring opens the main Score Sheets overview
    router.replace(withNoAnimation('/score-sheets') as any);
  };

  const buttons: Array<{ routeName: keyof typeof ICONS; onPress: () => void }> = [
    { routeName: 'rulebook', onPress: () => router.replace(withNoAnimation('/rulebook') as any) },
    { routeName: 'score-sheets', onPress: onScoringPress },
    { routeName: 'index', onPress: () => router.replace(withNoAnimation('/') as any) },
    { routeName: 'timers', onPress: () => void navigateToTab('/timers') },
    { routeName: 'dice', onPress: () => void navigateToTab('/dice') },
  ];

  // While on a score sheet, always highlight Scoring.
  const selectedRouteName = 'score-sheets';

  return (
    <View
      style={[
        styles.wrapper,
      ]}>
      <View style={styles.container}>
        {buttons.map((btn) => {
          const isFocused = btn.routeName === selectedRouteName;
          const iconColor = isFocused ? Colors.light.secondary : Colors.light.surface;
          const labelColor = isFocused ? Colors.light.secondary : Colors.light.surface;

          return (
            <Pressable
              key={btn.routeName}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              style={({ pressed }) => [styles.tab, pressed && { opacity: 0.7 }]}
              onPress={btn.onPress}>
              <View style={styles.iconLabelBubble}>
                {ICONS[btn.routeName] && (
                  <Image
                    source={ICONS[btn.routeName]}
                    style={styles.icon}
                    tintColor={iconColor}
                    contentFit="contain"
                  />
                )}
                <ThemedText numberOfLines={1} style={[styles.label, { color: labelColor }]}>
                  {LABELS[btn.routeName] ?? btn.routeName}
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
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    backgroundColor: 'transparent',
    zIndex: 1000,
    elevation: 1000,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.dark.background,
    borderRadius: 50,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconLabelBubble: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 999,
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

