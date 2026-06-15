/**
 * Theme types and value object.
 *
 * A theme is a palette: 4 background-tinted colors used by the engine and
 * the surrounding chrome (panels, highlights, borders). The image texture
 * (e.g. leather) is a separate concern and is loaded by the application.
 */

export interface ThemeColor {
  background: string; // CSS hex, e.g. "#7592ac"
  panel: string;
  highlight: string;
  border: string;
}

export interface Theme {
  name: string;
  color: ThemeColor;
  /** Optional image texture URL for the leather background. */
  texUrl?: string;
  altTexUrl?: string;
}
