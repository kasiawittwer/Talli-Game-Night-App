import type { ReactNode } from 'react';
import { useLayoutEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';

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
 *
 * Important: use RN `View` only here — raw DOM `<div>` wrappers around RN subtrees can fail to
 * paint children correctly in production (minified) React Native Web bundles.
 */
export function WebPhoneFrame({ children }: WebPhoneFrameProps) {
  const [viewport, setViewport] = useState<{ w: number; h: number }>(() => {
    if (typeof window === 'undefined') {
      return { w: 4096, h: 4096 };
    }
    return {
      w: Math.max(1, window.innerWidth),
      h: Math.max(1, window.innerHeight),
    };
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

  const { outerW, outerH, scale, needsScaleDown } = useMemo(() => {
    const W = IPHONE_17_PRO_VIEWPORT.width;
    const H = IPHONE_17_PRO_VIEWPORT.height;
    const oW = W + BEZEL * 2;
    const oH = H + BEZEL * 2;
    const winW = viewport.w;
    const winH = viewport.h;
    const maxW = Math.max(0, winW - FRAME_PADDING * 2);
    const maxH = Math.max(0, winH - FRAME_PADDING * 2);
    let s = Math.min(1, maxW / oW, maxH / oH);
    // Production static exports can transiently report a 0x0 viewport. Never allow a collapsed shell.
    if (!Number.isFinite(s) || s <= 0.01) s = 1;
    const needsShrink = s < 0.999;
    return { outerW: oW, outerH: oH, scale: s, needsScaleDown: needsShrink };
  }, [viewport.w, viewport.h]);

  if (Platform.OS !== 'web') {
    return <>{children}</>;
  }

  const dims = {
    width: IPHONE_17_PRO_VIEWPORT.width,
    height: IPHONE_17_PRO_VIEWPORT.height,
  };

  const safeScale = Number.isFinite(scale) && scale > 0.01 ? scale : 1;
  const scaledOuterW = Math.max(1, outerW * safeScale);
  const scaledOuterH = Math.max(1, outerH * safeScale);

  const frameShellStyle: ViewStyle = needsScaleDown
    ? ({
        width: outerW,
        height: outerH,
        borderRadius: OUTER_RADIUS,
        // RN Web: non-standard CSS zoom for narrow viewports only.
        zoom: safeScale,
      } as ViewStyle)
    : {
        width: outerW,
        height: outerH,
        borderRadius: OUTER_RADIUS,
      };

  return (
    <View style={[styles.page as ViewStyle, { minHeight: '100vh' as unknown as number }]}>
      <View style={[styles.shellClip as ViewStyle, { width: scaledOuterW, height: scaledOuterH }]}>
        <View style={[styles.phoneBezel as ViewStyle, frameShellStyle]}>
          <WebLayoutDimensionsProvider value={dims}>
            <View style={styles.screen as ViewStyle}>{children}</View>
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
    width: '100%',
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#c8c8c8',
    alignItems: 'center',
    justifyContent: 'center',
    padding: FRAME_PADDING,
  },
  shellClip: {
    overflow: 'hidden',
    flexShrink: 0,
    position: 'relative',
    // Containing block for any `position: fixed` descendants from navigation on web.
    transform: [{ scale: 1 }],
  },
  phoneBezel: {
    backgroundColor: '#1a1a1a',
    padding: BEZEL,
    overflow: 'hidden',
    position: 'relative',
  },
  screen: {
    flex: 1,
    width: W,
    height: H,
    overflow: 'hidden',
    borderRadius: OUTER_RADIUS - BEZEL,
    backgroundColor: '#000',
    position: 'relative',
    transform: [{ scale: 1 }],
  },
});
