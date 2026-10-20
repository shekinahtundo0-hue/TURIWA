import { useMemo } from 'react';
import { Platform, useWindowDimensions, type DimensionValue } from 'react-native';

export const TABLET_MIN_WIDTH = 768;
export const DESKTOP_MIN_WIDTH = 1024;

export type LayoutMode = 'phone' | 'tablet' | 'desktop';

export interface Layout {
  width: number;
  height: number;
  mode: LayoutMode;
  isPhone: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  /** Wide enough for the tab bar to become a left rail instead of a bottom bar. */
  useSidebar: boolean;
  gutter: number;
  contentMaxWidth: number;
  /** Fractional width for the big cards (circles, loans) in a wrapped row. */
  cardWidth: DimensionValue;
  /** Fractional width for the small service tiles on Home. */
  tileWidth: DimensionValue;
}

// A share of a wrapped row that still leaves room for the 10px column gaps.
function cellWidth(columns: number): DimensionValue {
  if (columns <= 1) return '100%';
  return `${Math.floor(100 / columns - 1.5)}%` as DimensionValue;
}

export function useResponsive(): Layout {
  const { width, height } = useWindowDimensions();

  return useMemo(() => {
    // A phone on its side is wide but has no vertical room, so it keeps the phone
    // layout instead of stretching two-column cards into a 390px-tall window.
    const cramped = height < 640;
    const mode: LayoutMode = cramped || width < TABLET_MIN_WIDTH
      ? 'phone'
      : width >= DESKTOP_MIN_WIDTH
        ? 'desktop'
        : 'tablet';
    const desktop = mode === 'desktop';
    const columns = desktop ? 2 : mode === 'tablet' ? 2 : 1;
    const tileColumns = desktop ? 4 : mode === 'tablet' ? 3 : 2;

    return {
      width,
      height,
      mode,
      isPhone: mode === 'phone',
      isTablet: mode === 'tablet',
      isDesktop: desktop,
      // iOS keeps its system bottom tab bar (including the liquid-glass variant on
      // iPad), so only web and Android swap the tabs for a rail.
      useSidebar: desktop && Platform.OS !== 'ios',
      gutter: desktop ? 32 : mode === 'tablet' ? 28 : 20,
      contentMaxWidth: desktop ? 860 : mode === 'tablet' ? 800 : 600,
      cardWidth: cellWidth(columns),
      tileWidth: cellWidth(tileColumns),
    };
  }, [width, height]);
}
