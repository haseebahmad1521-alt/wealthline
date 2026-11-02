import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/** Native: the keyboard's height while it is up, for fields that ride above it. */
export function useKeyboardInset(active: boolean) {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    if (!active) return setInset(0);
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setInset(e.endCoordinates.height));
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setInset(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [active]);
  return inset;
}
