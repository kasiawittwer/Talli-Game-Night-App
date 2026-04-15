import type { ReactNode } from 'react';
import { useLayoutEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { IPHONE_17_PRO_VIEWPORT } from '@/constants/iphone-17-pro';
import { WebLayoutDimensionsProvider } from '@/context/web-layout-dimensions-context';

const FRAME_PADDING = 24;
const OUTER_RADIUS = 55;
const BEZEL = 10;

type WebPhoneFrameProps = {
  children: ReactNode;
};

/**
 * On web only: centers the app in a fixed iPhone 17 Pro–sized viewport on a plain background.
 * Native builds are unchanged (children only).
 */
export function WebPhoneFrame({ children }: WebPhoneFrameProps) {
  // Do not use `useWindowDimensions()` for layout math on static hosting (Vercel, etc.): it can
  // stay 0 or update late, which makes scale 0 and hides the phone. Read the real window in
  // useLayoutEffect so the first paint after mount uses real innerWidth/innerHeight.
  const [viewport, setViewport] = useState<{ w: number; h: number }>({
    w: IPHONE_17_PRO_VIEWPORT.width,
    h: IPHONE_17_PRO_VIEWPORT.height,
  });

  useLayoutEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
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

  const { outerW, outerH, scale } = useMemo(() => {
    const W = IPHONE_17_PRO_VIEWPORT.width;
    const H = IPHONE_17_PRO_VIEWPORT.height;
    const oW = W + BEZEL * 2;
    const oH = H + BEZEL * 2;
    const winW = viewport.w;
    const winH = viewport.h;
    const maxW = Math.max(0, winW - FRAME_PADDING * 2);
    const maxH = Math.max(0, winH - FRAME_PADDING * 2);
    let s = Math.min(1, maxW / oW, maxH / oH);
    if (!Number.isFinite(s) || s <= 0) s = 1;
    return { outerW: oW, outerH: oH, scale: s };
  }, [viewport.w, viewport.h]);

  if (Platform.OS !== 'web') {
    return <>{children}</>;
  }

  const dims = {
    width: IPHONE_17_PRO_VIEWPORT.width,
    height: IPHONE_17_PRO_VIEWPORT.height,
  };

  // CSS transform:scale on an ancestor breaks horizontal pan scrolling inside the frame in Chromium/Safari.
  // Non-standard `zoom` scales layout and pointer handling correctly for this web-only preview shell.
  const frameShellStyle = {
    width: outerW,
    height: outerH,
    borderRadius: OUTER_RADIUS,
    zoom: scale,
  } as const;

  return (
    <View style={styles.page}>
      <View style={{ width: outerW * scale, height: outerH * scale, overflow: 'hidden' }}>
        <View style={[styles.phoneBezel, frameShellStyle]}>
          <WebLayoutDimensionsProvider value={dims}>
            <View style={styles.screen}>{children}</View>
          </WebLayoutDimensionsProvider>
        </View>
      </View>
    </View>
  );
}

const W = IPHONE_17_PRO_VIEWPORT.width;
const H = IPHONE_17_PRO_VIEWPORT.height;

const styles = StyleSheet.create({
  page: {
    flex: 1,
    width: '100%',
    minHeight: 0,
    // Desktop browser: vh guarantees the gray canvas + centered phone shell even if % height fails.
    ...(Platform.OS === 'web'
      ? ({ minHeight: '100vh' as unknown as number } as const)
      : {}),
    overflow: 'hidden',
    backgroundColor: '#c8c8c8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  phoneBezel: {
    backgroundColor: '#1a1a1a',
    padding: BEZEL,
    overflow: 'hidden',
  },
  screen: {
    flex: 1,
    width: W,
    height: H,
    overflow: 'hidden',
    borderRadius: OUTER_RADIUS - BEZEL,
    backgroundColor: '#000',
  },
});
