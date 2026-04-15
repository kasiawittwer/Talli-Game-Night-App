import type { ReactNode } from 'react';
import { useLayoutEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';

import { IPHONE_17_PRO_VIEWPORT } from '@/constants/iphone-17-pro';
import { WebLayoutDimensionsProvider } from '@/context/web-layout-dimensions-context';

const FRAME_PADDING = 24;
const OUTER_RADIUS = 55;
const BEZEL = 10;

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
    const maxW = Math.max(1, viewport.w - FRAME_PADDING * 2);
    const maxH = Math.max(1, viewport.h - FRAME_PADDING * 2);
    const raw = Math.min(1, maxW / OUTER_SHELL_W, maxH / OUTER_SHELL_H);
    if (!Number.isFinite(raw) || raw <= 0) return 1;
    return raw;
  }, [viewport.h, viewport.w]);

  const dims = {
    width: IPHONE_17_PRO_VIEWPORT.width,
    height: IPHONE_17_PRO_VIEWPORT.height,
  };

  return (
    <View style={styles.page as ViewStyle}>
      <View
        style={[
          styles.shellClip as ViewStyle,
          { width: OUTER_SHELL_W * shellScale, height: OUTER_SHELL_H * shellScale },
        ]}>
        <View style={[styles.phoneBezel as ViewStyle, { transform: [{ scale: shellScale }] }]}>
          <WebLayoutDimensionsProvider value={dims}>
            <View style={styles.screen as ViewStyle}>{children}</View>
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
    padding: FRAME_PADDING,
    zIndex: 0,
  },
  shellClip: {
    width: OUTER_SHELL_W,
    height: OUTER_SHELL_H,
    overflow: 'hidden',
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phoneBezel: {
    width: OUTER_SHELL_W,
    height: OUTER_SHELL_H,
    borderRadius: OUTER_RADIUS,
    backgroundColor: '#1a1a1a',
    padding: BEZEL,
    overflow: 'hidden',
  },
  screen: {
    width: IPHONE_17_PRO_VIEWPORT.width,
    height: IPHONE_17_PRO_VIEWPORT.height,
    overflow: 'hidden',
    borderRadius: OUTER_RADIUS - BEZEL,
    backgroundColor: '#000',
  },
});
