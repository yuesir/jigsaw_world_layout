/**
 * ThemeState — reactive theme value, derived from Variant.
 *
 *   ThemeState.val = THEME_PRESETS.coral;       // updates listeners
 *   ThemeState.getThemeFromOrdinal(2)            // → THEME_PRESETS.olive
 *   ThemeState.isLoaded.addListener(...)
 *   ThemeState.setToDefault();
 */
import { Variant } from '../reactive/variant';
import { THEME_PRESETS, DEFAULT_THEME_NAME, THEME_NAMES } from './presets';
import type { Theme } from './types';

const _nameToOrdinal: Map<string, number> = new Map();
THEME_NAMES.forEach((n, i) => _nameToOrdinal.set(n, i));

const _ordinalToName: Map<number, string> = new Map();
THEME_NAMES.forEach((n, i) => _ordinalToName.set(i, n));

export class ThemeStateClass {
  /** Current theme. */
  readonly val: Variant<Theme>;
  /** Set to true once the engine has applied the theme. */
  readonly isLoaded: Variant<boolean>;

  constructor() {
    this.val = new Variant<Theme>(THEME_PRESETS[DEFAULT_THEME_NAME]!, 'theme');
    this.isLoaded = new Variant<boolean>(false, 'theme.isLoaded');
  }

  getThemeFromOrdinal(ord: number | null | undefined): Theme {
    if (ord == null) return THEME_PRESETS[DEFAULT_THEME_NAME]!;
    const name = _ordinalToName.get(ord);
    return (name && THEME_PRESETS[name]) || THEME_PRESETS[DEFAULT_THEME_NAME]!;
  }

  getThemeFromName(name: string): Theme | null {
    return THEME_PRESETS[name] ?? null;
  }

  setToDefault(): void {
    this.val.val = THEME_PRESETS[DEFAULT_THEME_NAME]!;
  }

  isValidColor(name: string): boolean {
    return name in THEME_PRESETS;
  }

  names(): string[] {
    return THEME_NAMES.slice();
  }
}

export const ThemeState = new ThemeStateClass();
