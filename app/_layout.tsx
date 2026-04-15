import '../global.css';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { WebNoFocusRing } from '@/components/web-no-focus-ring';
import { WebPhoneFrame } from '@/components/web-phone-frame';
import { FavoritesProvider } from '@/context/favorites-context';
import { ActiveGamesProvider } from '@/context/active-games-context';
import { LastScoreSheetPathSync, LastScoreSheetProvider } from '@/context/last-score-sheet-context';
import { useColorScheme } from '@/hooks/use-color-scheme';

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  const [fontsLoaded, fontError] = useFonts({
    WixMadeforText: require('@/assets/fonts/WixMadeforText-Regular.ttf'),
    AquavitTalli: require('@/assets/fonts/AquavitTalli.otf'),
  });

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded || fontError) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    onLayoutRootView();
  }, [onLayoutRootView]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView
      style={
        Platform.OS === 'web'
          ? {
              flex: 1,
              width: '100%',
              minHeight: '100vh' as unknown as number,
              overflow: 'hidden',
            }
          : { flex: 1 }
      }>
      <WebNoFocusRing />
      <WebPhoneFrame>
        <FavoritesProvider>
          <ActiveGamesProvider>
            <LastScoreSheetProvider>
              <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
                <Stack screenOptions={{ animation: 'none' }}>
                  <Stack.Screen name="(tabs)" options={{ headerShown: false, animation: 'none' }} />
                  <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
                  <Stack.Screen name="mexican-train" options={{ headerShown: false, animation: 'none' }} />
                  <Stack.Screen name="yahtzee" options={{ headerShown: false, animation: 'none' }} />
                  <Stack.Screen name="wizard" options={{ headerShown: false, animation: 'none' }} />
                  <Stack.Screen name="clue" options={{ headerShown: false, animation: 'none' }} />
                  <Stack.Screen name="scrabble" options={{ headerShown: false, animation: 'none' }} />
                  <Stack.Screen name="five-crowns" options={{ headerShown: false, animation: 'none' }} />
                  <Stack.Screen name="scattergories" options={{ headerShown: false, animation: 'none' }} />
                  <Stack.Screen name="hand-and-foot" options={{ headerShown: false, animation: 'none' }} />
                  <Stack.Screen name="rook" options={{ headerShown: false, animation: 'none' }} />
                </Stack>
                <LastScoreSheetPathSync />
                <StatusBar style="auto" />
              </ThemeProvider>
            </LastScoreSheetProvider>
          </ActiveGamesProvider>
        </FavoritesProvider>
      </WebPhoneFrame>
    </GestureHandlerRootView>
  );
}
