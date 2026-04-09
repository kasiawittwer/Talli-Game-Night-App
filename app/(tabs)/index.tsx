import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useActiveGames } from '@/context/active-games-context';
import { useFavorites } from '@/context/favorites-context';


export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { favorites } = useFavorites();
  const { activeGames, clearActiveGame } = useActiveGames();

  const handleNewGamePress = () => {
    router.push('/score-sheets');
  };

  const handleFavoritePress = (route: string) => {
    router.push(route as any);
  };

  const handleActiveContinue = (route: string) => {
    router.push(route as any);
  };

  const handleActiveQuit = async (gameId: string, storageKey: string) => {
    try {
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      // Clear both the explicit storage key and a legacy fallback key pattern.
      const keys = Array.from(new Set([storageKey, `@sheet:${gameId}`])).filter(Boolean);
      if (keys.length > 0) {
        await AsyncStorage.multiRemove(keys);
      }
    } catch (error) {
      console.error('Failed to clear active game storage:', error);
    } finally {
      clearActiveGame(gameId);
    }
  };

  return (
    <ThemedView style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 16 }]}>
        <View style={styles.logoWrapper}>
          <Image
            source={require('@/assets/images/Talli-logo.svg')}
            style={styles.logo}
            contentFit="contain"
          />
        </View>

        {activeGames.length > 0 && (
          <View style={styles.activeSection}>
            {activeGames.map((game) => (
              <View key={game.id} style={styles.activeCard}>
                <ThemedText style={styles.activeTitle}>{game.name}</ThemedText>
                <View style={styles.activeActions}>
                  <Pressable
                    style={styles.circleButton}
                    onPress={() => handleActiveQuit(game.id, game.storageKey)}
                  >
                    <Image
                      source={require('@/assets/icons/x-close.svg')}
                      style={styles.circleIcon}
                      contentFit="contain"
                    />
                  </Pressable>
                  <Pressable
                    style={styles.circleButtonDark}
                    onPress={() => handleActiveContinue(game.route)}
                  >
                    <ThemedText style={styles.checkmark}>✓</ThemedText>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        <Pressable style={styles.newGameButton} onPress={handleNewGamePress}>
          <ThemedText style={styles.newGameText}>New Game</ThemedText>
        </Pressable>

        {favorites.length > 0 && (
          <>
            <View style={styles.favoritesHeader}>
              <ThemedText type="subtitle">Favorite Games</ThemedText>
            </View>

            <View style={styles.favoritesGrid}>
              {favorites.map((fav) => (
                <Pressable
                  key={fav.id}
                  style={styles.favoriteCard}
                  onPress={() => handleFavoritePress(fav.route)}
                >
                  <ThemedText style={styles.favoriteName}>{fav.name}</ThemedText>
                  <View style={styles.cardPreview}>
                    <View style={styles.previewHeader}>
                      <ThemedText style={styles.previewTitle}>{fav.name}</ThemedText>
                    </View>
                    <View style={[styles.previewColorBar, { backgroundColor: fav.color }]}>
                      <View style={styles.previewColorSegment} />
                      <View style={styles.previewColorSegment} />
                    </View>
                    <View style={styles.previewLines}>
                      {[1, 2, 3, 4, 5].map((i) => (
                        <View key={i} style={styles.previewLine} />
                      ))}
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>
          </>
        )}
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
  logoWrapper: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logo: {
    width: 280,
    height: 96,
  },
  activeSection: {
    gap: 12,
    marginBottom: 24,
  },
  activeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.light.primary,
    borderRadius: 999,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  activeTitle: {
    color: '#FFFFFF',
    fontSize: 18,
  },
  activeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  circleButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleButtonDark: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.dark.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleIcon: {
    width: 14,
    height: 14,
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  newGameButton: {
    alignSelf: 'center',
    marginBottom: 24,
    backgroundColor: Colors.dark.background,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 999,
  },
  newGameText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  favoritesHeader: {
    marginBottom: 12,
  },
  favoritesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  favoriteCard: {
    width: '30%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 10,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 3,
  },
  favoriteName: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  cardPreview: {
    backgroundColor: '#FAFAFA',
    borderRadius: 6,
    padding: 6,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  previewHeader: {
    marginBottom: 4,
  },
  previewTitle: {
    fontSize: 6,
    textAlign: 'center',
  },
  previewColorBar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 2,
    marginBottom: 4,
    overflow: 'hidden',
  },
  previewColorSegment: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.3)',
  },
  previewLines: {
    gap: 3,
  },
  previewLine: {
    height: 4,
    backgroundColor: '#E5E5E5',
    borderRadius: 1,
  },
});

