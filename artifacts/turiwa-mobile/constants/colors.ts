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
    text: '#183126',
    tint: '#4CAF7D',
    background: '#FAFAFA',
    foreground: '#183126',
    card: '#ffffff',
    cardForeground: '#183126',
    primary: '#1B5E3A',
    primaryForeground: '#ffffff',
    secondary: '#4CAF7D',
    secondaryForeground: '#ffffff',
    muted: '#E8F5EE',
    mutedForeground: '#65766c',
    accent: '#D4AF37',
    accentForeground: '#5d4810',
    destructive: '#D9534F',
    destructiveForeground: '#ffffff',
    border: '#DDEBE2',
    input: '#DDEBE2',
    success: '#4CAF7D',
    successSoft: '#E8F5EE',
    inkSoft: '#456055',
    warmSurface: '#FBF6E8',
  },

  dark: {
    text: '#F4FBF6',
    tint: '#5CC98E',
    background: '#0E1F16',
    foreground: '#F4FBF6',
    card: '#1A2E22',
    cardForeground: '#F4FBF6',
    primary: '#5CC98E',
    primaryForeground: '#0E1F16',
    secondary: '#2D8057',
    secondaryForeground: '#F4FBF6',
    muted: '#1F3B2B',
    mutedForeground: '#A6BDAE',
    accent: '#D4AF37',
    accentForeground: '#F9E8A6',
    destructive: '#E87873',
    destructiveForeground: '#0E1F16',
    border: '#2B4B38',
    input: '#2B4B38',
    success: '#5CC98E',
    successSoft: '#204A34',
    inkSoft: '#C0D1C5',
    warmSurface: '#3B341D',
  },

  radius: 16,
};

export default colors;
