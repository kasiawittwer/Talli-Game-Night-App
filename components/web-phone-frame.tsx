import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';

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
  const { width: vw, height: vh } = useWindowDimensions();

  const { outerW, outerH, scale } = useMemo(() => {
    const W = IPHONE_17_PRO_VIEWPORT.width;
    const H = IPHONE_17_PRO_VIEWPORT.height;
    const oW = W + BEZEL * 2;
    const oH = H + BEZEL * 2;
    const maxW = Math.max(0, vw - FRAME_PADDING * 2);
    const maxH = Math.max(0, vh - FRAME_PADDING * 2);
    const s = Math.min(1, maxW / oW, maxH / oH);
    return { outerW: oW, outerH: oH, scale: s };
  }, [vw, vh]);

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
    maxHeight: '100%',
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
