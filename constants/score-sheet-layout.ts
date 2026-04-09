import type { StyleProp, ViewStyle } from 'react-native';

/**
 * ScrollView content for premade/custom score sheets: center the sheet when
 * content is shorter than the screen; still scrolls normally when content is tall.
 */
export const SCORE_SHEET_SCROLL_CONTENT: StyleProp<ViewStyle> = {
  flexGrow: 1,
  justifyContent: 'center',
};
