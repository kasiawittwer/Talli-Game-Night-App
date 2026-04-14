import React, {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { type LayoutChangeEvent, Platform, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { useLayoutDimensions } from '@/hooks/use-layout-dimensions';

import type { HorizontalPagerProps } from './horizontal-pager.types';

const SPRING = { damping: 28, stiffness: 280 };

/**
 * Web: horizontal paging without `ScrollView`. RN Web’s horizontal ScrollView maps to
 * `overflow-x: auto`, which always creates a scroll container — the browser paints a
 * horizontal scrollbar (“sliding bar”) that CSS cannot reliably remove under zoom/flex.
 *
 * Native uses `PagerView` (no DOM overflow scroll). Here we match that model: a clipped
 * viewport + `translateX` on the row, driven by pan gestures (and wheel on desktop).
 */
export function HorizontalPager({
  style,
  contentContainerStyle,
  pageIndex,
  onPageIndexChange,
  children,
}: HorizontalPagerProps) {
  const { width: layoutW, height: layoutH } = useLayoutDimensions();
  const [viewportW, setViewportW] = useState(0);
  const [viewportH, setViewportH] = useState(0);
  const pageWidth = Math.max(1, viewportW || layoutW);
  const pageMinHeight = Math.max(1, viewportH || layoutH);
  const pages = Children.toArray(children).filter(isValidElement);
  const pageCount = pages.length;

  const translateX = useSharedValue(0);
  const pageWidthShared = useSharedValue(pageWidth);
  const pageCountShared = useSharedValue(pageCount);
  const startTranslate = useSharedValue(0);

  const pageIndexRef = useRef(pageIndex);
  pageIndexRef.current = pageIndex;

  useEffect(() => {
    pageCountShared.value = pageCount;
  }, [pageCount, pageCountShared]);

  useEffect(() => {
    pageWidthShared.value = pageWidth;
  }, [pageWidth, pageWidthShared]);

  useEffect(() => {
    if (pageWidth <= 0) return;
    translateX.value = withSpring(-pageIndex * pageWidth, SPRING);
  }, [pageIndex, pageWidth, translateX]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setViewportW(width);
    setViewportH(height);
  };

  const commitIndex = useCallback(
    (idx: number) => {
      onPageIndexChange(idx);
    },
    [onPageIndexChange]
  );

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-14, 14])
        .onBegin(() => {
          startTranslate.value = translateX.value;
        })
        .onUpdate((e) => {
          const w = pageWidthShared.value;
          const n = Math.max(1, pageCountShared.value);
          const minX = -(n - 1) * w;
          const maxX = 0;
          const next = startTranslate.value + e.translationX;
          translateX.value = Math.max(minX, Math.min(maxX, next));
        })
        .onEnd((e) => {
          const w = pageWidthShared.value;
          const n = Math.max(1, pageCountShared.value);
          const projected = translateX.value + 0.15 * e.velocityX;
          let idx = Math.round(-projected / w);
          idx = Math.max(0, Math.min(n - 1, idx));
          translateX.value = withSpring(-idx * w, SPRING);
          runOnJS(commitIndex)(idx);
        }),
    [commitIndex, pageCountShared, pageWidthShared, startTranslate, translateX]
  );

  const rowAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const onWheel = useCallback(
    (e: { nativeEvent: { deltaX?: number; deltaY?: number } }) => {
      if (Platform.OS !== 'web' || pageCount <= 1) return;
      const dx = e.nativeEvent.deltaX ?? 0;
      const dy = e.nativeEvent.deltaY ?? 0;
      if (Math.abs(dx) <= Math.abs(dy)) return;
      if (Math.abs(dx) < 18) return;
      const idx = pageIndexRef.current;
      if (dx > 0 && idx < pageCount - 1) {
        onPageIndexChange(idx + 1);
      } else if (dx < 0 && idx > 0) {
        onPageIndexChange(idx - 1);
      }
    },
    [pageCount, onPageIndexChange]
  );

  if (pageCount === 0) {
    return <View style={[{ flex: 1, overflow: 'hidden' }, style]} />;
  }

  const webClip =
    Platform.OS === 'web'
      ? ({
          overflow: 'hidden' as const,
          overflowX: 'hidden' as const,
          overflowY: 'hidden' as const,
        })
      : {};

  return (
    <View
      {...(Platform.OS === 'web' ? { dataSet: { rnPagerViewport: '1' } } : {})}
      style={[{ flex: 1, width: '100%', minHeight: 0, overflow: 'hidden' }, webClip, style]}
      onLayout={onLayout}
      {...(Platform.OS === 'web' ? { onWheel } : {})}>
      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[
            rowAnimatedStyle,
            {
              flexDirection: 'row',
              width: pageWidth * pageCount,
              height: pageMinHeight,
              minHeight: pageMinHeight,
              maxHeight: pageMinHeight,
              ...webClip,
            },
            contentContainerStyle,
          ]}>
          {pages.map((child, i) => (
            <View
              key={i}
              style={{
                width: pageWidth,
                height: pageMinHeight,
                minHeight: pageMinHeight,
                maxHeight: pageMinHeight,
                ...webClip,
              }}>
              {child}
            </View>
          ))}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
