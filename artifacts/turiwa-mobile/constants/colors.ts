/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    text: '#10231b',
    tint: '#1f6b4a',
    background: '#f6f8f4',
    foreground: '#10231b',
    card: '#ffffff',
    cardForeground: '#10231b',
    primary: '#1f6b4a',
    primaryForeground: '#ffffff',
    secondary: '#e8f0ea',
    secondaryForeground: '#1f6b4a',
    muted: '#e9eee9',
    mutedForeground: '#6a786f',
    accent: '#e9b949',
    accentForeground: '#4a3410',
    destructive: '#b8473d',
    destructiveForeground: '#ffffff',
    border: '#dce6de',
    input: '#dce6de',
    success: '#2f8f63',
    successSoft: '#e4f3e9',
    inkSoft: '#4b5e52',
    warmSurface: '#fff8e8',
  },

  dark: {
    text: '#f5faf4',
    tint: '#8bd0a6',
    background: '#10231b',
    foreground: '#f5faf4',
    card: '#193127',
    cardForeground: '#f5faf4',
    primary: '#8bd0a6',
    primaryForeground: '#10231b',
    secondary: '#264536',
    secondaryForeground: '#d9f2df',
    muted: '#223d30',
    mutedForeground: '#a8b9ac',
    accent: '#e9b949',
    accentForeground: '#2f2510',
    destructive: '#ef8c80',
    destructiveForeground: '#10231b',
    border: '#2b4c3b',
    input: '#2b4c3b',
    success: '#8bd0a6',
    successSoft: '#244735',
    inkSoft: '#c1d0c4',
    warmSurface: '#3d351d',
  },

  radius: 20,
};

export default colors;
