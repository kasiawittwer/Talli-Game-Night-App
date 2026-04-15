import type { ReactNode } from 'react';
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

  const dims = {
    width: IPHONE_17_PRO_VIEWPORT.width,
    height: IPHONE_17_PRO_VIEWPORT.height,
  };

  return (
    <View style={styles.page as ViewStyle}>
      <View style={styles.shellClip as ViewStyle}>
        <View style={styles.phoneBezel as ViewStyle}>
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
