import type { StyleProp, ViewStyle } from 'react-native';

/**
 * ScrollView content: grow to fill; center sheet vertically when shorter than the viewport.
 */
export const SCORE_SHEET_SCROLL_CONTENT: StyleProp<ViewStyle> = {
  flexGrow: 1,
  justifyContent: 'center',
};

/**
 * Same horizontal margins as home / score-sheets index: 24px phone, 96px tablet with 900px max column.
 * Wrap the game title + main ScrollView in a View with this + {@link SCORE_SHEET_PAGE_COLUMN_TABLET} on tablet.
 */
export const SCORE_SHEET_PAGE_COLUMN: ViewStyle = {
  flex: 1,
  minWidth: 0,
  width: '100%',
  paddingHorizontal: 24,
};

export const SCORE_SHEET_PAGE_COLUMN_TABLET: ViewStyle = {
  paddingHorizontal: 96,
  maxWidth: 900,
  alignSelf: 'center',
};
