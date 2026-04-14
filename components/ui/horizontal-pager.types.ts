import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export type HorizontalPagerProps = {
  style?: StyleProp<ViewStyle>;
  /** Web only: merged into the horizontal row wrapper; ignored on native. */
  contentContainerStyle?: StyleProp<ViewStyle>;
  pageIndex: number;
  onPageIndexChange: (index: number) => void;
  children: ReactNode;
};
