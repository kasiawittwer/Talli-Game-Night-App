import { forwardRef } from 'react';
import { TextInput as RNTextInput, TextInputProps } from 'react-native';

/**
 * TextInput that explicitly requests the on-screen keyboard on focus (especially important on Android).
 * Use this anywhere users type on a phone; refs forward to the native TextInput.
 */
export const KeyboardTextInput = forwardRef<RNTextInput, TextInputProps>(function KeyboardTextInput(
  { showSoftInputOnFocus = true, ...rest },
  ref
) {
  return <RNTextInput ref={ref} showSoftInputOnFocus={showSoftInputOnFocus} {...rest} />;
});
