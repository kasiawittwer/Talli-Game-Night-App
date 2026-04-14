import type { MutableRefObject } from 'react';
import { forwardRef, useCallback, useLayoutEffect, useRef } from 'react';
import { Platform } from 'react-native';
import type { NativeSyntheticEvent, TextInput as RNTextInput, TextInputFocusEventData, TextInputProps } from 'react-native';
import { TextInput as RNTextInputComponent } from 'react-native';

function scheduleWebFocusRingRemoval(host: unknown) {
  const apply = () => applyWebNoFocusRingStyle(host);
  apply();
  queueMicrotask(apply);
  requestAnimationFrame(() => {
    apply();
    requestAnimationFrame(apply);
  });
  setTimeout(apply, 0);
  setTimeout(apply, 50);
}

function getWebFocusTarget(e: NativeSyntheticEvent<TextInputFocusEventData>): unknown {
  const ne = e?.nativeEvent as unknown as { target?: unknown };
  if (ne?.target && typeof ne.target === 'object') return ne.target;
  return null;
}

function applyWebNoFocusRingStyle(host: unknown) {
  const el = host as { style?: CSSStyleDeclaration } | null;
  if (!el?.style?.setProperty) return;
  el.style.setProperty('outline', 'none', 'important');
  el.style.setProperty('outline-width', '0px', 'important');
  el.style.setProperty('outline-style', 'none', 'important');
  el.style.setProperty('outline-offset', '0px', 'important');
  el.style.setProperty('box-shadow', 'none', 'important');
  el.style.setProperty('-webkit-box-shadow', 'none', 'important');
  /* Some UAs draw focus as a hairline border on the control, not only outline. */
  el.style.setProperty('border', '0', 'important');
  el.style.setProperty('border-width', '0', 'important');
}

/**
 * TextInput that explicitly requests the on-screen keyboard on focus (especially important on Android).
 * Use this anywhere users type on a phone; refs forward to the native TextInput.
 *
 * On **web**, the browser can paint `:focus-visible` *after* layout; we strip outline/shadow/border
 * on the real node in `onFocus` + microtasks/rAF/timeouts and again after each commit.
 */
export const KeyboardTextInput = forwardRef<RNTextInput, TextInputProps>(function KeyboardTextInput(
  { showSoftInputOnFocus = true, style, ...rest },
  ref
) {
  const localRef = useRef<RNTextInput | null>(null);

  const { onFocus, onBlur, ...passThrough } = rest;

  const setRef = useCallback(
    (node: RNTextInput | null) => {
      localRef.current = node;
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref) {
        (ref as MutableRefObject<RNTextInput | null>).current = node;
      }
    },
    [ref]
  );

  const handleFocus = useCallback(
    (e: NativeSyntheticEvent<TextInputFocusEventData>) => {
      if (Platform.OS === 'web') {
        const target = getWebFocusTarget(e) ?? localRef.current;
        scheduleWebFocusRingRemoval(target);
      }
      onFocus?.(e);
    },
    [onFocus]
  );

  const handleBlur = useCallback(
    (e: NativeSyntheticEvent<TextInputFocusEventData>) => {
      onBlur?.(e);
    },
    [onBlur]
  );

  useLayoutEffect(() => {
    if (Platform.OS !== 'web') return;
    scheduleWebFocusRingRemoval(localRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- post-commit after React writes styles
  });

  const webStyle =
    Platform.OS === 'web'
      ? ({
          outlineWidth: 0,
          outlineOffset: 0,
          outlineColor: 'transparent',
          boxShadow: 'none',
          borderWidth: 0,
        } as const)
      : null;

  return (
    <RNTextInputComponent
      ref={setRef}
      showSoftInputOnFocus={showSoftInputOnFocus}
      style={webStyle ? [style, webStyle] : style}
      onFocus={handleFocus}
      onBlur={handleBlur}
      {...passThrough}
    />
  );
});
