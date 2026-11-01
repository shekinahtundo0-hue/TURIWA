import { useMemo } from 'react';
import { Platform, useWindowDimensions, type DimensionValue } from 'react-native';

export const TABLET_MIN_WIDTH = 768;
export const DESKTOP_MIN_WIDTH = 1024;
export const WIDE_MIN_WIDTH = 1600;
export const RAIL_WIDTH_COMPACT = 72;
export const RAIL_WIDTH_LABELLED = 92;

export type LayoutMode = 'phone' | 'tablet' | 'desktop';

/**
 * One hierarchy that scales with the viewport instead of a fixed pixel size per
 * screen. `body` and `caption` stay under 16 only because every line in this app is
 * a label or a figure, not a paragraph; the brief's 16px rule is for prose.
 */
export interface Typography {
  eyebrow: number;
  screenTitle: number;
  subtitle: number;
  sectionTitle: number;
  body: number;
  caption: number;
}

export interface Layout {
  width: number;
  height: number;
  mode: LayoutMode;
  isPhone: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  /** Wide enough for the tab bar to become a left rail instead of a bottom bar. */
  useSidebar: boolean;
  /** Width the rail paints at this size: a tablet has less to spare than a desktop. */
  railWidth: number;
  gutter: number;
  contentMaxWidth: number;
  /** Fractional width for the big cards (circles, loans) in a wrapped row. */
  cardWidth: DimensionValue;
  /** Fractional width for the small service tiles on Home. */
  tileWidth: DimensionValue;
  type: Typography;
}

// A share of a wrapped row that still leaves room for the 10px column gaps.
function cellWidth(columns: number): DimensionValue {
  if (columns <= 1) return '100%';
  return `${Math.floor(100 / columns - 1.5)}%` as DimensionValue;
}

export function useResponsive(): Layout {
  const { width, height } = useWindowDimensions();

  return useMemo(() => {
    // A phone turned sideways is wide but still short, so keep its phone layout.
    // A short desktop browser window should remain desktop and use its sidebar.
    const compactLandscapePhone = height < 520 && width < DESKTOP_MIN_WIDTH;
    const mode: LayoutMode = compactLandscapePhone || width < TABLET_MIN_WIDTH
      ? 'phone'
      : width >= DESKTOP_MIN_WIDTH
        ? 'desktop'
        : 'tablet';
    const desktop = mode === 'desktop';
    const columns = desktop ? 2 : mode === 'tablet' ? 2 : 1;
    const tileColumns = desktop ? 4 : mode === 'tablet' ? 3 : 2;
    // A 320-375px phone cannot carry a 28px display title without clipping the
    // greeting to an ellipsis, and a 1920px window makes the same 28px read as body copy.
    const cramped = mode === 'phone' && width < 390;
    const type: Typography = desktop
      ? { eyebrow: 12, screenTitle: 34, subtitle: 15.5, sectionTitle: 19, body: 15, caption: 12.5 }
      : mode === 'tablet'
        ? { eyebrow: 12, screenTitle: 30, subtitle: 14.5, sectionTitle: 18, body: 14.5, caption: 12 }
        : { eyebrow: 11.5, screenTitle: cramped ? 21 : 28, subtitle: 13.5, sectionTitle: 17, body: 14, caption: 11.5 };

    return {
      width,
      height,
      mode,
      isPhone: mode === 'phone',
      isTablet: mode === 'tablet',
      isDesktop: desktop,
      // A tablet is wide enough that the bottom bar steals scroll height from the
      // ledger, so it takes the rail too - just the narrow, icon-only one.
      // iOS keeps its system bottom tab bar (including the liquid-glass variant on
      // iPad), so only web and Android swap the tabs for a rail.
      useSidebar: mode !== 'phone' && Platform.OS !== 'ios',
      railWidth: desktop ? RAIL_WIDTH_LABELLED : RAIL_WIDTH_COMPACT,
      gutter: desktop ? 32 : mode === 'tablet' ? 28 : 20,
      // A 1920px window should not show a phone column with two empty margins.
      contentMaxWidth: desktop ? (width >= WIDE_MIN_WIDTH ? 1080 : 900) : mode === 'tablet' ? 800 : 600,
      cardWidth: cellWidth(columns),
      tileWidth: cellWidth(tileColumns),
      type,
    };
  }, [width, height]);
}
