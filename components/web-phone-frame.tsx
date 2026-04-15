import type { ReactNode } from 'react';
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
  if (Platform.OS !== 'web') {
    return <>{children}</>;
  }

  const W = IPHONE_17_PRO_VIEWPORT.width;
  const H = IPHONE_17_PRO_VIEWPORT.height;
  const outerW = W + BEZEL * 2;
  const outerH = H + BEZEL * 2;

  const dims = {
    width: IPHONE_17_PRO_VIEWPORT.width,
    height: IPHONE_17_PRO_VIEWPORT.height,
  };

  const frameShellStyle: ViewStyle = {
    width: outerW,
    height: outerH,
    borderRadius: OUTER_RADIUS,
  };

  return (
    <View style={[styles.page as ViewStyle, { minHeight: '100vh' as unknown as number }]}>
      <View style={[styles.shellClip as ViewStyle, { width: outerW, height: outerH }]}>
        <View style={[styles.phoneBezel as ViewStyle, frameShellStyle]}>
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
    width: IPHONE_17_PRO_VIEWPORT.width,
    height: IPHONE_17_PRO_VIEWPORT.height,
    overflow: 'hidden',
    borderRadius: OUTER_RADIUS - BEZEL,
    backgroundColor: '#000',
    position: 'relative',
    transform: [{ scale: 1 }],
  },
});
