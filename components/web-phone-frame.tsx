import type { CSSProperties, ReactNode } from 'react';
import { useLayoutEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

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
  // stay 0 or update late, which makes scale 0 and hides the phone.
  // Never start with the phone's logical size as the "window": that makes maxW < outerW on the first
  // layout pass, so scale < 1 and we apply `zoom` on desktop until useLayoutEffect runs — fragile on Safari.
  // Client: read window immediately. SSR/static shell: assume a large desktop so scale stays 1 until hydrate.
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
    if (!Number.isFinite(s) || s <= 0) s = 1;
    // MacBook / iPad: viewport is almost always larger than the logical phone — use 1:1 layout (no zoom).
    // Narrow mobile browsers: scale down; non-standard `zoom` is only needed in that case.
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

  // CSS transform:scale on an ancestor breaks horizontal pan scrolling inside the frame in Chromium/Safari.
  // Non-standard `zoom` is only applied when the window is smaller than the shell (mobile browsers).
  const pageStyle: CSSProperties = {
    width: '100%',
    minHeight: '100vh',
    height: '100dvh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#c8c8c8',
    boxSizing: 'border-box',
    padding: `${FRAME_PADDING}px`,
  };

  const shellViewportStyle: CSSProperties = {
    width: outerW * scale,
    height: outerH * scale,
    overflow: 'hidden',
    flexShrink: 0,
  };

  const bezelStyle: CSSProperties = {
    width: outerW,
    height: outerH,
    borderRadius: OUTER_RADIUS,
    backgroundColor: '#1a1a1a',
    padding: BEZEL,
    overflow: 'hidden',
    boxSizing: 'border-box',
    ...(needsScaleDown ? { zoom: scale } : {}),
  };

  const screenStyle: CSSProperties = {
    width: IPHONE_17_PRO_VIEWPORT.width,
    height: IPHONE_17_PRO_VIEWPORT.height,
    overflow: 'hidden',
    borderRadius: OUTER_RADIUS - BEZEL,
    backgroundColor: '#000',
  };

  return (
    <div style={pageStyle}>
      <div style={shellViewportStyle}>
        <div style={bezelStyle}>
          <WebLayoutDimensionsProvider value={dims}>
            <div style={screenStyle}>{children}</div>
          </WebLayoutDimensionsProvider>
        </div>
      </div>
    </div>
  );
}
