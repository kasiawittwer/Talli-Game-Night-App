import { useContext } from 'react';
import { Platform, useWindowDimensions } from 'react-native';

import { WebLayoutDimensionsContext } from '@/context/web-layout-dimensions-context';

/**
 * Dimensions for layout breakpoints (e.g. phone vs tablet). On web inside `WebPhoneFrame`,
 * uses the frame's inner size so a wide browser window does not enable tablet styles while
 * the app is drawn in a narrow phone preview.
 */
export function useLayoutDimensions() {
  const webDims = useContext(WebLayoutDimensionsContext);
  const win = useWindowDimensions();

  if (Platform.OS === 'web' && webDims && webDims.width > 0 && webDims.height > 0) {
    return {
      ...win,
      width: webDims.width,
      height: webDims.height,
    };
  }
  return win;
}
