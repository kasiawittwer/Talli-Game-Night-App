import { useLayoutEffect } from 'react';
import { Platform } from 'react-native';

const STYLE_ID = 'web-no-input-focus-ring';

function isTextField(el: EventTarget | null): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return true;
  return el.getAttribute('role') === 'textbox';
}

/** Strip UA focus ring as early as possible; some browsers repaint after :focus-visible. */
function stripWebTextFieldOutline(el: HTMLElement) {
  el.style.setProperty('outline', 'none', 'important');
  el.style.setProperty('outline-width', '0px', 'important');
  el.style.setProperty('outline-style', 'none', 'important');
  el.style.setProperty('outline-offset', '0px', 'important');
  el.style.setProperty('box-shadow', 'none', 'important');
  el.style.setProperty('-webkit-box-shadow', 'none', 'important');
}

/**
 * Web-only: removes the default browser focus ring on `<input>` / `<textarea>` (what RN Web
 * renders for `TextInput`). Stylesheets alone are not always enough (timing, UA :focus-visible).
 * This uses capture-phase `focusin` + inline `!important` on the real DOM node.
 */
export function WebNoFocusRing() {
  useLayoutEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    const onFocusIn = (e: FocusEvent) => {
      const t = e.target;
      if (!isTextField(t)) return;
      stripWebTextFieldOutline(t);
      requestAnimationFrame(() => {
        stripWebTextFieldOutline(t);
        requestAnimationFrame(() => stripWebTextFieldOutline(t));
      });
    };

    document.addEventListener('focusin', onFocusIn, true);

    let styleEl = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = STYLE_ID;
      styleEl.textContent = `
input, textarea, [role="textbox"] {
  outline: none !important;
  outline-width: 0 !important;
  outline-offset: 0 !important;
  box-shadow: none !important;
}
`;
      document.head.appendChild(styleEl);
    }

    return () => {
      document.removeEventListener('focusin', onFocusIn, true);
      styleEl?.remove();
    };
  }, []);

  return null;
}
