import { DISPLAY_KEY } from "@/lib/display";
import { NIGHT_END, NIGHT_START, THEME_COLORS } from "@/lib/theme";

/**
 * Runs in <head> before first paint. Reads the stored mode (any problem means Automatic), resolves it with the same
 * rule as resolveTheme in src/lib/theme.ts (device-local hour, or the device's own dark setting), and sets
 * data-theme-mode, data-theme and the single theme-color meta on <html>. Plain ES5 in try/catch: storage can be
 * blocked, and if the whole script fails the CSS fallback follows the device. It reads no cookie and calls no
 * network, so pages stay cacheable. tests/unit/theme.test.ts keeps this and resolveTheme in agreement.
 */
export const THEME_INIT_SCRIPT = `(function(){var h=document.documentElement,m="auto";try{var r=localStorage.getItem(${JSON.stringify(DISPLAY_KEY)});if(r){var t=JSON.parse(r).theme;if(t==="light"||t==="dark")m=t}}catch(e){}try{var d=m==="dark";if(m==="auto"){var n=new Date().getHours();d=n>=${NIGHT_START}||n<${NIGHT_END}||!!(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches)}var C=${JSON.stringify(THEME_COLORS)},k=d?"dark":"light",e=document.createElement("meta");h.setAttribute("data-theme-mode",m);h.setAttribute("data-theme",k);e.name="theme-color";e.content=C[k];document.head.appendChild(e)}catch(e){}})();`;
