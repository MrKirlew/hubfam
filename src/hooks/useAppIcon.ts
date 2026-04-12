/**
 * useAppIcon — lazy-loads app icons with an in-memory cache.
 *
 * Icons are fetched on-demand from the native module (base64 PNG).
 * A global Map cache prevents re-fetching icons that have already been loaded,
 * keeping FlashList smooth when scrolling through 100+ apps.
 */

import { useState, useEffect } from "react";
import { getAppIcon } from "../../modules/app-manager";

const iconCache = new Map<string, string>();

export function useAppIcon(packageName: string, sizeDp: number = 48): string | null {
  const [icon, setIcon] = useState<string | null>(
    iconCache.get(packageName) ?? null
  );

  useEffect(() => {
    // Already cached
    if (iconCache.has(packageName)) {
      setIcon(iconCache.get(packageName)!);
      return;
    }

    let cancelled = false;

    getAppIcon(packageName, sizeDp)
      .then((base64) => {
        iconCache.set(packageName, base64);
        if (!cancelled) setIcon(base64);
      })
      .catch(() => {
        // Icon unavailable — leave as null (placeholder shown)
      });

    return () => {
      cancelled = true;
    };
  }, [packageName, sizeDp]);

  return icon;
}
