import type { ReactNode } from 'react';
import { useLayoutEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';

import { IPHONE_17_PRO_VIEWPORT } from '@/constants/iphone-17-pro';
import { WebLayoutDimensionsProvider } from '@/context/web-layout-dimensions-context';

/** Horizontal inset from the browser edge. */
const FRAME_PADDING_X = 24;
/** Vertical inset so gray background stays visible above/below the shell. */
const FRAME_PADDING_Y = 150;
const OUTER_RADIUS = 55;
const BEZEL = 10;
/** Extra shrink so scale math matches painted bounds (no transform/layout mismatch). */
const VISUAL_SHRINK_BUFFER = 0.98;

/** Outer shell size (logical px): phone inset + bezel padding on both sides. */
const OUTER_SHELL_W = IPHONE_17_PRO_VIEWPORT.width + BEZEL * 2;
const OUTER_SHELL_H = IPHONE_17_PRO_VIEWPORT.height + BEZEL * 2;

type WebPhoneFrameProps = {
  children: ReactNode;
};

/**
 * On web only: centers the app in a fixed iPhone 17 Pro–sized viewport on a plain background.
 * Native builds are unchanged (children only).
 *
 * Uses `position: 'fixed'` + explicit pixel sizes in StyleSheet so static export / SSR never
 * produces a 0×0 clip or stray `zoom` from flex parents. Do not use CSS `zoom` here.
 * Fit-to-viewport uses scaled width/height (not CSS `transform: scale`) so layout matches paint.
 */
export function WebPhoneFrame({ children }: WebPhoneFrameProps) {
  if (Platform.OS !== 'web') {
    return <>{children}</>;
  }

  const [viewport, setViewport] = useState<{ w: number; h: number }>(() => {
    if (typeof window === 'undefined') {
      return { w: 1400, h: 900 };
    }
    return {
      w: Math.max(1, window.innerWidth),
      h: Math.max(1, window.innerHeight),
    };
  });

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    const sync = () => {
      setViewport({
        w: Math.max(1, window.innerWidth),
        h: Math.max(1, window.innerHeight),
      });
    };
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, []);

  const shellScale = useMemo(() => {
    const maxW = Math.max(1, viewport.w - FRAME_PADDING_X * 2);
    const maxH = Math.max(1, viewport.h - FRAME_PADDING_Y * 2);
    const raw = Math.min(1, maxW / OUTER_SHELL_W, maxH / OUTER_SHELL_H);
    if (!Number.isFinite(raw) || raw <= 0) return 1;
    // Keep a little breathing room so bezel corners never clip at viewport edges.
    return raw * VISUAL_SHRINK_BUFFER;
  }, [viewport.h, viewport.w]);

  const dims = {
    width: IPHONE_17_PRO_VIEWPORT.width,
    height: IPHONE_17_PRO_VIEWPORT.height,
  };

  // Scale by explicit width/height — not `transform: scale()`. On web, transforms do not shrink
  // the layout box, so a smaller clip + centered full-size child was clipping the shell.
  const s = shellScale;
  const outerW = OUTER_SHELL_W * s;
  const outerH = OUTER_SHELL_H * s;
  const bezel = BEZEL * s;
  const screenW = IPHONE_17_PRO_VIEWPORT.width * s;
  const screenH = IPHONE_17_PRO_VIEWPORT.height * s;
  const radiusOuter = OUTER_RADIUS * s;
  const radiusScreen = (OUTER_RADIUS - BEZEL) * s;

  return (
    <View style={styles.page as ViewStyle}>
      <View style={[styles.shellClip as ViewStyle, { width: outerW, height: outerH }]}>
        <View
          style={[
            styles.phoneBezel as ViewStyle,
            {
              width: outerW,
              height: outerH,
              padding: bezel,
              borderRadius: radiusOuter,
            },
          ]}>
          <WebLayoutDimensionsProvider value={dims}>
            <View
              style={[
                styles.screen as ViewStyle,
                {
                  width: screenW,
                  height: screenH,
                  borderRadius: radiusScreen,
                },
              ]}>
              {children}
            </View>
          </WebLayoutDimensionsProvider>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    position: 'fixed',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    backgroundColor: '#c8c8c8',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: FRAME_PADDING_X,
    paddingVertical: FRAME_PADDING_Y,
    zIndex: 0,
  },
  shellClip: {
    overflow: 'hidden',
    flexShrink: 0,
  },
  phoneBezel: {
    backgroundColor: '#1a1a1a',
    overflow: 'hidden',
  },
  screen: {
    overflow: 'hidden',
    backgroundColor: '#000',
  },
});
