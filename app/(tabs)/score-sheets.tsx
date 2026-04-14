import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/themed-view';
import { Colors, Fonts, SCREEN_EXTRA_TOP_PADDING, TABLET_MIN_WIDTH } from '@/constants/theme';
import { useActiveGames } from '@/context/active-games-context';
import { useFavorites } from '@/context/favorites-context';
import { useLayoutDimensions } from '@/hooks/use-layout-dimensions';

type ScoreSheet = {
  id: string;
  name: string;
  color: string;
  route: string;
};

const PREMADE_SHEETS: ScoreSheet[] = [
  { id: '1', name: 'Mexican Train', color: Colors.light.accent, route: '/mexican-train' },
  { id: '2', name: 'Yahtzee', color: Colors.light.primary, route: '/yahtzee' },
  { id: '3', name: 'Wizard', color: Colors.light.secondary, route: '/wizard' },
  { id: '4', name: 'Clue', color: Colors.light.secondary, route: '/clue' },
  { id: '5', name: 'Scrabble', color: Colors.light.accent, route: '/scrabble' },
  { id: '6', name: 'Five Crowns', color: Colors.light.primary, route: '/five-crowns' },
  { id: '7', name: 'Scattergories', color: Colors.light.secondary, route: '/scattergories' },
  { id: '8', name: 'Hand & Foot', color: Colors.light.primary, route: '/hand-and-foot' },
  { id: '9', name: 'Rook', color: Colors.light.accent, route: '/rook' },
];

const CUSTOM_SHEETS_KEY = '@customSheets';

export default function ScoreSheetsScreen() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useLayoutDimensions();
  const isTablet = windowWidth >= TABLET_MIN_WIDTH;
  const router = useRouter();
  const { favorites, removeFavoriteById, reconcileFavoritesWithCustomSheets } = useFavorites();
  const { activeGames, clearActiveGame } = useActiveGames();

  const handleFavoritePress = (route: string) => {
    router.push(route as any);
  };

  const [customSheets, setCustomSheets] = useState<ScoreSheet[]>([]);

  const deleteCustomSheet = async (id: string) => {
    removeFavoriteById(id);

    const storageKey = `@sheet:custom:${id}`;

    await AsyncStorage.removeItem(storageKey);
    clearActiveGame(id);

    try {
      const stored = await AsyncStorage.getItem(CUSTOM_SHEETS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Array<{ id: string }>;
        if (Array.isArray(parsed)) {
          const next = parsed.filter((s) => s.id !== id);
          await AsyncStorage.setItem(CUSTOM_SHEETS_KEY, JSON.stringify(next));
        }
      }
    } catch {
      // ignore
    }

    setCustomSheets((prev) => prev.filter((s) => s.id !== id));
  };

  useFocusEffect(
    useCallback(() => {
      void reconcileFavoritesWithCustomSheets();

      const loadCustomSheets = async () => {
        try {
          const stored = await AsyncStorage.getItem(CUSTOM_SHEETS_KEY);
          if (!stored) return;

          const parsed = JSON.parse(stored) as Array<{
            id: string;
            name: string;
            color?: string;
          }>;
          if (!Array.isArray(parsed)) return;

          const mapped: ScoreSheet[] = parsed.map((s) => ({
            id: s.id,
            name: s.name,
            color: s.color ?? Colors.light.secondary,
            route: `/custom-score-sheet?sheetId=${s.id}`,
          }));

          setCustomSheets(mapped);
        } catch {
          // ignore
        }
      };

      void loadCustomSheets();
    }, [reconcileFavoritesWithCustomSheets])
  );

  const gamesToShow = [...PREMADE_SHEETS, ...customSheets];

  return (
    <ThemedView style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          isTablet && styles.scrollContentTablet,
          { paddingTop: insets.top + 16 + SCREEN_EXTRA_TOP_PADDING },
        ]}
        showsVerticalScrollIndicator={true}
      >
        {/* Active Games Section */}
        {activeGames.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Active Games</Text>
            <View style={[styles.cardsRow, isTablet && styles.cardsRowTablet]}>
              {activeGames.map((game) => (
                <View key={game.id} style={[styles.scoreCard, isTablet && styles.scoreCardTablet]}>
                  {game.route.includes('/custom-score-sheet') && (
                    <Pressable
                      style={styles.deleteButton}
                      onPress={() => {
                        void deleteCustomSheet(game.id);
                      }}
                      accessibilityRole="button">
                      <Image
                        source={require('@/assets/trash-03.svg')}
                        style={styles.deleteIcon}
                        tintColor={Colors.light.surface}
                        contentFit="contain"
                      />
                    </Pressable>
                  )}

                  <Pressable onPress={() => router.push(game.route as any)} style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, isTablet && styles.cardTitleTablet]}>{game.name}</Text>
                    <View style={[styles.cardPreview, isTablet && styles.cardPreviewTablet]}>
                      <View style={styles.previewHeader}>
                        <Text style={[styles.previewTitleSmall, isTablet && styles.previewTitleSmallTablet]}>
                          {game.name}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.previewColorBar,
                          isTablet && styles.previewColorBarTablet,
                          { backgroundColor: game.color },
                        ]}>
                        <View style={styles.previewColorSegment} />
                        <View style={styles.previewColorSegment} />
                      </View>
                      <View style={[styles.previewLines, isTablet && styles.previewLinesTablet]}>
                        {[1, 2, 3, 4, 5].map((i) => (
                          <View key={i} style={[styles.previewLine, isTablet && styles.previewLineTablet]} />
                        ))}
                      </View>
                    </View>
                  </Pressable>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Favorite Games Section */}
        {favorites.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Favorite Games</Text>
            <View style={[styles.cardsRow, isTablet && styles.cardsRowTablet]}>
              {favorites.map((sheet) => (
                <Pressable
                  key={sheet.id}
                  style={[styles.scoreCard, isTablet && styles.scoreCardTablet]}
                  onPress={() => handleFavoritePress(sheet.route)}
                >
                  <Text style={[styles.cardTitle, isTablet && styles.cardTitleTablet]}>{sheet.name}</Text>
                  <View style={[styles.cardPreview, isTablet && styles.cardPreviewTablet]}>
                    <View style={styles.previewHeader}>
                      <Text style={[styles.previewTitleSmall, isTablet && styles.previewTitleSmallTablet]}>
                        {sheet.name}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.previewColorBar,
                        isTablet && styles.previewColorBarTablet,
                        { backgroundColor: sheet.color },
                      ]}>
                      <View style={styles.previewColorSegment} />
                      <View style={styles.previewColorSegment} />
                    </View>
                    <View style={[styles.previewLines, isTablet && styles.previewLinesTablet]}>
                      {[1, 2, 3, 4, 5].map((i) => (
                        <View key={i} style={[styles.previewLine, isTablet && styles.previewLineTablet]} />
                      ))}
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {/* Games Section */}
        <Text style={styles.sectionTitle}>Games</Text>
        <View style={[styles.cardsRow, isTablet && styles.cardsRowTablet]}>
          {gamesToShow.map((sheet) => (
            <View key={sheet.id} style={[styles.scoreCard, isTablet && styles.scoreCardTablet]}>
              {sheet.route.includes('/custom-score-sheet') && (
                <Pressable
                  style={styles.deleteButton}
                  onPress={() => {
                    void deleteCustomSheet(sheet.id);
                  }}
                  accessibilityRole="button">
                  <Image
                    source={require('@/assets/trash-03.svg')}
                    style={styles.deleteIcon}
                    tintColor={Colors.light.surface}
                    contentFit="contain"
                  />
                </Pressable>
              )}

              <Pressable onPress={() => router.push(sheet.route as any)} style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, isTablet && styles.cardTitleTablet]}>{sheet.name}</Text>
                <View style={[styles.cardPreview, isTablet && styles.cardPreviewTablet]}>
                  <View style={styles.previewHeader}>
                    <Text style={[styles.previewTitleSmall, isTablet && styles.previewTitleSmallTablet]}>
                      {sheet.name}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.previewColorBar,
                      isTablet && styles.previewColorBarTablet,
                      { backgroundColor: sheet.color },
                    ]}>
                    <View style={styles.previewColorSegment} />
                    <View style={styles.previewColorSegment} />
                  </View>
                  <View style={[styles.previewLines, isTablet && styles.previewLinesTablet]}>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <View key={i} style={[styles.previewLine, isTablet && styles.previewLineTablet]} />
                    ))}
                  </View>
                </View>
              </Pressable>
            </View>
          ))}
        </View>

        {/* Create Custom Button */}
        <Pressable
          style={styles.createButton}
          onPress={() => router.push('/custom-score-sheet')}
        >
          <Text style={styles.createButtonText}>Create Custom Score Sheet</Text>
        </Pressable>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  scrollContentTablet: {
    paddingHorizontal: 96,
    maxWidth: 900,
    width: '100%',
    alignSelf: 'center',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.dark.background,
    marginBottom: 16,
    marginTop: 8,
  },
  cardsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  cardsRowTablet: {
    justifyContent: 'flex-start',
    alignContent: 'flex-start',
    gap: 18,
  },
  scoreCard: {
    width: '30%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 10,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 3,
    position: 'relative',
  },
  scoreCardTablet: {
    width: '30%',
    flexGrow: 0,
    padding: 12,
    transform: [{ scale: 1.1 }],
    marginVertical: 8,
  },
  cardTitle: {
    fontFamily: Fonts.body,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.dark.background,
    marginBottom: 6,
  },
  cardTitleTablet: {
    fontSize: 14,
  },
  cardPreview: {
    backgroundColor: '#FAFAFA',
    borderRadius: 6,
    padding: 6,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  cardPreviewTablet: {
    borderRadius: 8,
    padding: 8,
  },
  deleteButton: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.dark.background,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  deleteIcon: {
    width: 14,
    height: 14,
  },
  previewHeader: {
    marginBottom: 4,
  },
  previewTitleSmall: {
    fontSize: 6,
    fontFamily: Fonts.body,
    color: Colors.dark.background,
    textAlign: 'center',
  },
  previewTitleSmallTablet: {
    fontSize: 8,
  },
  previewColorBar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 2,
    marginBottom: 4,
    overflow: 'hidden',
  },
  previewColorBarTablet: {
    height: 10,
    marginBottom: 5,
  },
  previewColorSegment: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.3)',
  },
  previewLines: {
    gap: 3,
  },
  previewLinesTablet: {
    gap: 4,
  },
  previewLine: {
    height: 4,
    backgroundColor: '#E5E5E5',
    borderRadius: 1,
  },
  previewLineTablet: {
    height: 5,
    borderRadius: 1,
  },
  createButton: {
    alignSelf: 'center',
    backgroundColor: Colors.dark.background,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 999,
    marginTop: 8,
    marginBottom: 16,
  },
  createButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
});
