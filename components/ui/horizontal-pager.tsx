import PagerView from 'react-native-pager-view';
import React, { Children, isValidElement } from 'react';
import { StyleSheet, View } from 'react-native';

import type { HorizontalPagerProps } from './horizontal-pager.types';

export type { HorizontalPagerProps };

/**
 * Horizontal paging that swipes reliably on native (UIPageViewController / ViewPager2)
 * without fighting nested pressables. Web build uses `horizontal-pager.web.tsx` instead.
 */
export function HorizontalPager({
  style,
  pageIndex,
  onPageIndexChange,
  children,
}: HorizontalPagerProps) {
  const pages = Children.toArray(children).filter(isValidElement);

  return (
    <PagerView
      style={[styles.flex, style]}
      initialPage={pageIndex}
      onPageSelected={(e) => onPageIndexChange(e.nativeEvent.position)}>
      {pages.map((child, i) => (
        <View key={i} style={styles.page}>
          {child}
        </View>
      ))}
    </PagerView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { flex: 1 },
});
