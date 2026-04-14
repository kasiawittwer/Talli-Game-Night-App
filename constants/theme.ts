/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

export const Colors = {
  light: {
    text: '#0E0906', // Wild Black
    background: '#FFFFFF', // Background Color
    primary: '#EB5729', // True Orange
    secondary: '#93AFEC', // Cornflower Blue (slightly adjusted hex spelling)
    accent: '#CED564', // Yellow Grass
    surface: '#FFFDF5', // Fresh Cream
    icon: '#0E0906',
    tabIconDefault: '#0E0906',
    tabIconSelected: '#93AFEC', // Cornflower Blue (matches selected tab bar)
  },
  dark: {
    text: '#FFFDF5',
    background: '#0E0906',
    primary: '#EB5729',
    secondary: '#93AFEC',
    accent: '#CED564',
    surface: '#151718',
    icon: '#FFFDF5',
    tabIconDefault: '#FFFDF5',
    tabIconSelected: '#93AFEC', // Cornflower Blue (matches selected tab bar)
  },
};

export const Fonts = {
  heading: 'WixMadeforText',
  gameTitle: 'AquavitTalli',
  body: 'WixMadeforText',
  mono: 'monospace',
};

/** Width at which we use iPad-style layout (portrait iPad and large tablets). */
export const TABLET_MIN_WIDTH = 768;

/** Extra space below the status bar / safe area on all main screens (breathing room). */
export const SCREEN_EXTRA_TOP_PADDING = 10;
