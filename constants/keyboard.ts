import { Platform } from 'react-native';

/**
 * Typical header row below the status bar (horizontal padding + ~44pt controls).
 * Used with KeyboardAvoidingView when the header is a sibling above the avoiding view.
 */
export const IOS_HEADER_HEIGHT = 68;

/**
 * Screens whose root uses `paddingTop: insets.top` and put KeyboardAvoidingView as the
 * first child: the avoiding view starts directly under the safe area — offset ≈ safe top.
 */
export function iosKeyboardOffsetWithSafeTop(safeAreaTop: number): number {
  if (Platform.OS !== 'ios') return 0;
  return safeAreaTop;
}

/**
 * Screens where KeyboardAvoidingView sits below a full-width header (e.g. Rulebook, custom sheet chat).
 */
export function iosKeyboardOffsetBelowHeader(
  safeAreaTop: number,
  headerHeight: number = IOS_HEADER_HEIGHT
): number {
  if (Platform.OS !== 'ios') return 0;
  return safeAreaTop + headerHeight;
}

/**
 * Same geometry as {@link iosKeyboardOffsetBelowHeader} but for any native platform (iOS + Android)
 * when using `KeyboardAvoidingView` with `behavior="padding"` under a fixed header.
 */
export function keyboardVerticalOffsetBelowHeader(
  safeAreaTop: number,
  headerHeight: number = IOS_HEADER_HEIGHT
): number {
  if (Platform.OS === 'web') return 0;
  return safeAreaTop + headerHeight;
}

/**
 * Chat / dock UIs where `KeyboardAvoidingView` is already a sibling **below** the app header
 * and the screen uses `paddingTop: insets.top`. Passing safe-area + header again as
 * `keyboardVerticalOffset` double-counts and lifts the input too far above the keyboard.
 */
export function keyboardVerticalOffsetBelowSiblingHeader(): number {
  return 0;
}
