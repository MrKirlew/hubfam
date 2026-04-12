const { withAndroidManifest } = require("@expo/config-plugins");

/**
 * Expo config plugin for the app-manager module.
 * Merges QUERY_ALL_PACKAGES and REQUEST_DELETE_PACKAGES into the host
 * app's AndroidManifest.xml at prebuild time.
 */
function withAppManagerPermissions(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    if (!manifest["uses-permission"]) {
      manifest["uses-permission"] = [];
    }

    const permissions = [
      "android.permission.QUERY_ALL_PACKAGES",
      "android.permission.REQUEST_DELETE_PACKAGES",
    ];

    for (const perm of permissions) {
      const exists = manifest["uses-permission"].some(
        (p) => p.$?.["android:name"] === perm
      );
      if (!exists) {
        manifest["uses-permission"].push({
          $: { "android:name": perm },
        });
      }
    }

    return config;
  });
}

module.exports = withAppManagerPermissions;
