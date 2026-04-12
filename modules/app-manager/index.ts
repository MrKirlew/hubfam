import AppManagerModule from "./src/AppManagerModule";

export interface InstalledApp {
  packageName: string;
  appName: string;
  isSystem: boolean;
  apkSizeBytes: number;
  installTimeMs: number;
}

/**
 * Fetch all installed applications from the device.
 * @param includeSystem - Whether to include system/pre-installed apps (default: false)
 */
export async function getInstalledApps(
  includeSystem: boolean = false
): Promise<InstalledApp[]> {
  return AppManagerModule.getInstalledApps(includeSystem);
}

/**
 * Get the app icon as a base64-encoded PNG string.
 * @param packageName - The package name (e.g. "com.spotify.music")
 * @param sizeDp - Icon size in dp (default: 48)
 */
export async function getAppIcon(
  packageName: string,
  sizeDp: number = 48
): Promise<string> {
  return AppManagerModule.getAppIcon(packageName, sizeDp);
}

/**
 * Trigger the system uninstall dialog for a package.
 * Each uninstall requires user confirmation via the Android system dialog.
 * @param packageName - The package to uninstall
 * @returns true if the intent was dispatched (does NOT mean user confirmed)
 */
export async function uninstallApp(packageName: string): Promise<boolean> {
  return AppManagerModule.uninstallApp(packageName);
}

/**
 * Open the system App Info page for a package.
 * From there the user can clear cache, clear storage, force stop, etc.
 * @param packageName - The package to manage
 */
export async function openAppSettings(packageName: string): Promise<boolean> {
  return AppManagerModule.openAppSettings(packageName);
}

// ── Do Not Disturb ────────────────────────────────────────────────────

/** Check if DND is currently enabled on the device. */
export async function isDndEnabled(): Promise<boolean> {
  return AppManagerModule.isDndEnabled();
}

/** Check if the app has permission to control DND. */
export async function hasDndPermission(): Promise<boolean> {
  return AppManagerModule.hasDndPermission();
}

/** Open system settings to grant DND permission (one-time). */
export async function requestDndPermission(): Promise<boolean> {
  return AppManagerModule.requestDndPermission();
}

/** Enable Do Not Disturb (silence all notifications). */
export async function enableDnd(): Promise<boolean> {
  return AppManagerModule.enableDnd();
}

/** Disable Do Not Disturb (restore normal notifications). */
export async function disableDnd(): Promise<boolean> {
  return AppManagerModule.disableDnd();
}

// ── Screen Brightness ─────────────────────────────────────────────────

/** Set screen brightness (0.01 to 1.0). */
export async function setScreenBrightness(brightness: number): Promise<boolean> {
  return AppManagerModule.setScreenBrightness(brightness);
}

/** Get current screen brightness (0.0 to 1.0). */
export async function getScreenBrightness(): Promise<number> {
  return AppManagerModule.getScreenBrightness();
}
