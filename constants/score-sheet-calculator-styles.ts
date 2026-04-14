import { StyleSheet } from 'react-native';

import { Colors } from '@/constants/theme';

/**
 * Shared calculator modal styles for premade + custom score sheets (scaled down from original).
 */
export const scoreSheetCalculatorStyles = StyleSheet.create({
  calcOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
    elevation: 999,
  },
  calcContainer: {
    width: '72%',
    maxWidth: 300,
    backgroundColor: Colors.dark.background,
    borderRadius: 16,
    padding: 12,
  },
  calcHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  calcTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  calcClose: {
    color: '#FFFFFF',
    fontSize: 18,
    padding: 3,
  },
  calcDisplay: {
    backgroundColor: '#1C1C1C',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    alignItems: 'flex-end',
  },
  calcExpressionText: {
    color: '#888888',
    fontSize: 15,
    fontWeight: '400',
    marginBottom: 3,
    minHeight: 18,
  },
  calcDisplayText: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '300',
  },
  calcButtons: {
    gap: 8,
  },
  calcRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  calcBtn: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    minHeight: 0,
    aspectRatio: 1,
    backgroundColor: '#333333',
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  /**
   * Spans two columns; height matches one key width (same as other rows). On web, omitting
   * aspectRatio let flex stretch the row and distorted "." and "=" — use 2:1 width:height.
   */
  calcBtnZero: {
    flex: 2,
    flexBasis: 0,
    aspectRatio: 2,
  },
  calcBtnGray: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    minHeight: 0,
    aspectRatio: 1,
    backgroundColor: '#A5A5A5',
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  calcBtnOrange: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    minHeight: 0,
    aspectRatio: 1,
    backgroundColor: Colors.light.primary,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  calcBtnText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '400',
  },
  calcBtnTextWhite: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '400',
  },
});
