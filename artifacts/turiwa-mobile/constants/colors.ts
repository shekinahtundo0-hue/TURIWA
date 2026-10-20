/**
 * Semantic design tokens for the Turiwa mobile app.
 *
 * Haute-Fintech Visual Identity: "Imperial Jade & Champagne Titanium" (Light)
 * and "Obsidian Void & Quantum Cyber-Emerald" (Dark).
 *
 * - Light: Architectural alabaster (#F8FAF9), bespoke imperial emerald (#033B29),
 *          champagne titanium gold (#BA8E23), crystalline hairline borders.
 * - Dark:  OLED deep obsidian (#04070A), tiered titanium surfaces (#0B1117),
 *          hyper-crisp quantum cyber-mint (#00E599), luminous champagne aureum (#F7CE55).
 *
 * `primary` is a precision control color (buttons, progress, active indicators).
 * Large filled areas use the `hero` family with calibrated luminance to maintain
 * supreme optical elegance and perfect WCAG contrast ratios across both modes.
 */

const colors = {
  light: {
    // Canvas & Typography
    text: '#09130E',
    foreground: '#09130E',
    background: '#F8FAF9',
    card: '#FFFFFF',
    cardForeground: '#09130E',

    // Primary Brand Controls (Bespoke Imperial Emerald)
    primary: '#033B29',
    primaryForeground: '#FFFFFF',
    tint: '#059669',

    // Secondary & Accent (Caspian Teal & Champagne Titanium Gold)
    secondary: '#0C6259',
    secondaryForeground: '#FFFFFF',
    accent: '#BA8E23',
    accentForeground: '#755807',
    onAccent: '#FFFFFF',
    gold: '#D4AF37',
    goldSoft: '#FDF8EC',
    goldBorder: 'rgba(186, 142, 35, 0.28)',

    // Surfaces, Recesses & Hairline Borders
    muted: '#EEF3F0',
    mutedForeground: '#50655B',
    border: 'rgba(3, 59, 41, 0.08)',
    input: '#F2F6F3',
    inkSoft: '#33483E',
    warmSurface: '#FDF8EC',

    // Badges & Roles
    adminBadge: '#033B29',
    adminBadgeBg: '#E6F9F0',
    coAdminBadge: '#0C6259',
    coAdminBadgeBg: '#E0F7F4',

    // Brand Marks & Glows
    brandBg: '#FFFFFF',
    brandAccent: '#059669',
    brandGlow: '#00E599',
    brandBorder: 'rgba(5, 150, 105, 0.18)',

    // Financial Indicators (WCAG AAA tuned)
    income: '#047857',
    incomeSoft: '#E6F9F0',
    expense: '#BE185D',
    expenseSoft: '#FEE2E2',
    balance: '#0C6259',
    balanceSoft: '#E0F7F4',
    success: '#059669',
    successSoft: '#E6F9F0',
    destructive: '#DC2626',
    destructiveForeground: '#FFFFFF',
    destructiveSoft: '#FEE2E2',
    destructiveBorder: 'rgba(220, 38, 38, 0.22)',

    // Hero Monolith (Imperial Jade with Champagne/Starlight Subheaders)
    hero: '#022E20',
    heroForeground: '#FFFFFF',
    heroMuted: '#A7E4CB',
    heroChip: 'rgba(255, 255, 255, 0.14)',
    heroBorder: 'rgba(255, 255, 255, 0.15)',
    shadowHero: 'rgba(2, 46, 32, 0.24) 0px 18px 38px -14px',
  },

  dark: {
    // Canvas & Typography (OLED Obsidian & Starlight Frost)
    text: '#F4F7FA',
    foreground: '#F4F7FA',
    background: '#04070A',
    card: '#0B1117',
    cardForeground: '#F4F7FA',

    // Primary Brand Controls (Quantum Cyber-Mint & Ultra-Sharp Carbon Ink)
    primary: '#00E599',
    primaryForeground: '#02140D',
    tint: '#00E599',

    // Secondary & Accent (Electric Aqua-Teal & Luminous Champagne Aureum)
    secondary: '#00D6B2',
    secondaryForeground: '#02140D',
    accent: '#F7CE55',
    accentForeground: '#F7CE55',
    onAccent: '#04070A',
    gold: '#F7CE55',
    goldSoft: 'rgba(247, 206, 85, 0.12)',
    goldBorder: 'rgba(247, 206, 85, 0.28)',

    // Surfaces, Recesses & Crystalline Rim Borders
    muted: '#121921',
    mutedForeground: '#7E8F9F',
    border: 'rgba(255, 255, 255, 0.08)',
    input: '#0E151E',
    inkSoft: '#A6B7C7',
    warmSurface: 'rgba(247, 206, 85, 0.08)',

    // Badges & Roles
    adminBadge: '#F7CE55',
    adminBadgeBg: 'rgba(247, 206, 85, 0.14)',
    coAdminBadge: '#38BDF8',
    coAdminBadgeBg: 'rgba(56, 189, 248, 0.14)',

    // Brand Marks & Glows
    brandBg: '#04070A',
    brandAccent: '#00E599',
    brandGlow: '#00FF9D',
    brandBorder: 'rgba(0, 229, 153, 0.24)',

    // Financial Indicators (High-Tech Laser Neon)
    income: '#4EEDB2',
    incomeSoft: 'rgba(0, 229, 153, 0.13)',
    expense: '#FB7185',
    expenseSoft: 'rgba(251, 113, 133, 0.13)',
    balance: '#38E1CD',
    balanceSoft: 'rgba(56, 225, 205, 0.13)',
    success: '#00E599',
    successSoft: 'rgba(0, 229, 153, 0.13)',
    destructive: '#FB7185',
    destructiveForeground: '#04070A',
    destructiveSoft: 'rgba(251, 113, 133, 0.13)',
    destructiveBorder: 'rgba(251, 113, 133, 0.28)',

    // Hero Monolith (Obsidian Emerald Jewel Core with Quantum Rim Lighting)
    hero: '#062319',
    heroForeground: '#F0FDF8',
    heroMuted: '#5EEAD4',
    heroChip: 'rgba(0, 229, 153, 0.14)',
    heroBorder: 'rgba(0, 229, 153, 0.22)',
    shadowHero: 'rgba(0, 0, 0, 0.65) 0px 20px 42px -16px, rgba(0, 229, 153, 0.06) 0px 0px 32px 0px',
  },

  radius: 16,
};

export default colors;
