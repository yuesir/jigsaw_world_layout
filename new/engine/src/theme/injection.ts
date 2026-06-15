/**
 * Inject a theme's palette into the document as CSS custom properties
 * under the given root element. The engine itself does not depend on the
 * DOM, but the demo UI reads these via `var(--jigsaw-…)`.
 *
 *   injectTheme(ThemeState.val.val, document.documentElement);
 */
import type { Theme } from './types';

export function injectTheme(theme: Theme, root: HTMLElement): void {
  root.style.setProperty('--jigsaw-bg', theme.color.background);
  root.style.setProperty('--jigsaw-panel', theme.color.panel);
  root.style.setProperty('--jigsaw-highlight', theme.color.highlight);
  root.style.setProperty('--jigsaw-border', theme.color.border);
}
