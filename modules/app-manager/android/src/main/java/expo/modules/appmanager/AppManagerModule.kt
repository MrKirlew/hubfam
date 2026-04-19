package expo.modules.appmanager

import android.app.AlarmManager
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Base64
import android.view.WindowManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream
import java.io.File

class AppManagerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AppManager")

    // ── List installed applications ──────────────────────────────────────
    AsyncFunction("getInstalledApps") { includeSystem: Boolean ->
      val context = appContext.reactContext ?: throw Error("Context not available")
      val pm = context.packageManager

      val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        PackageManager.ApplicationInfoFlags.of(PackageManager.GET_META_DATA.toLong())
      } else {
        @Suppress("DEPRECATION")
        null
      }

      val apps = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && flags != null) {
        pm.getInstalledApplications(flags)
      } else {
        @Suppress("DEPRECATION")
        pm.getInstalledApplications(PackageManager.GET_META_DATA)
      }

      val ownPackage = context.packageName

      apps.filter { appInfo ->
        // Always exclude our own app
        appInfo.packageName != ownPackage &&
        // Filter system apps unless requested
        (includeSystem || (appInfo.flags and ApplicationInfo.FLAG_SYSTEM) == 0)
      }.map { appInfo ->
        val appName = pm.getApplicationLabel(appInfo).toString()
        val isSystem = (appInfo.flags and ApplicationInfo.FLAG_SYSTEM) != 0

        val apkSize = try {
          File(appInfo.sourceDir).length()
        } catch (_: Exception) {
          0L
        }

        val installTime = try {
          val pkgInfo = pm.getPackageInfo(appInfo.packageName, 0)
          pkgInfo.firstInstallTime
        } catch (_: Exception) {
          0L
        }

        mapOf(
          "packageName" to appInfo.packageName,
          "appName" to appName,
          "isSystem" to isSystem,
          "apkSizeBytes" to apkSize,
          "installTimeMs" to installTime
        )
      }.sortedBy { (it["appName"] as String).lowercase() }
    }

    // ── Get app icon as base64 PNG ───────────────────────────────────────
    AsyncFunction("getAppIcon") { packageName: String, sizeDp: Int ->
      val context = appContext.reactContext ?: throw Error("Context not available")
      val pm = context.packageManager
      val density = context.resources.displayMetrics.density
      val sizePx = (sizeDp * density).toInt()

      val drawable: Drawable = try {
        pm.getApplicationIcon(packageName)
      } catch (_: PackageManager.NameNotFoundException) {
        throw Error("Package not found: $packageName")
      }

      val bitmap = drawableToBitmap(drawable, sizePx)
      val stream = ByteArrayOutputStream()
      bitmap.compress(Bitmap.CompressFormat.PNG, 80, stream)
      val bytes = stream.toByteArray()
      bitmap.recycle()

      Base64.encodeToString(bytes, Base64.NO_WRAP)
    }

    // ── Trigger system uninstall dialog ──────────────────────────────────
    AsyncFunction("uninstallApp") { packageName: String ->
      val activity = appContext.currentActivity
        ?: throw Error("No active activity")

      val intent = Intent(Intent.ACTION_DELETE).apply {
        data = Uri.parse("package:$packageName")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      activity.startActivity(intent)
      true
    }

    // ── Open system App Info page (clear cache/storage/force stop) ───────
    AsyncFunction("openAppSettings") { packageName: String ->
      val activity = appContext.currentActivity
        ?: throw Error("No active activity")

      val intent = Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
        data = Uri.parse("package:$packageName")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      activity.startActivity(intent)
      true
    }

    // ── Do Not Disturb ──────────────────────────────────────────────────

    AsyncFunction("isDndEnabled") {
      val context = appContext.reactContext ?: throw Error("Context not available")
      val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      nm.currentInterruptionFilter == NotificationManager.INTERRUPTION_FILTER_NONE ||
        nm.currentInterruptionFilter == NotificationManager.INTERRUPTION_FILTER_ALARMS
    }

    AsyncFunction("hasDndPermission") {
      val context = appContext.reactContext ?: throw Error("Context not available")
      val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      nm.isNotificationPolicyAccessGranted
    }

    AsyncFunction("requestDndPermission") {
      val activity = appContext.currentActivity ?: throw Error("No active activity")
      val intent = Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      activity.startActivity(intent)
      true
    }

    AsyncFunction("enableDnd") {
      val context = appContext.reactContext ?: throw Error("Context not available")
      val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (!nm.isNotificationPolicyAccessGranted) throw Error("DND permission not granted")
      nm.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_NONE)
      true
    }

    AsyncFunction("disableDnd") {
      val context = appContext.reactContext ?: throw Error("Context not available")
      val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (!nm.isNotificationPolicyAccessGranted) throw Error("DND permission not granted")
      nm.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_ALL)
      true
    }

    // ── Screen Brightness ───────────────────────────────────────────────

    AsyncFunction("setScreenBrightness") { brightness: Double ->
      val activity = appContext.currentActivity ?: throw Error("No active activity")
      val clamped = brightness.coerceIn(0.01, 1.0).toFloat()
      activity.runOnUiThread {
        val params = activity.window.attributes
        params.screenBrightness = clamped
        activity.window.attributes = params
      }
      true
    }

    AsyncFunction("getScreenBrightness") {
      val activity = appContext.currentActivity ?: throw Error("No active activity")
      val brightness = activity.window.attributes.screenBrightness
      if (brightness < 0) 0.5 else brightness.toDouble()
    }

    // ── Exact alarm permission (Android 12 / API 31+) ────────────────────
    // SCHEDULE_EXACT_ALARM is the permission that lets us deliver
    // notifications at the exact wall-clock time the user set. On Android
    // 14+ the user must grant it via Settings; this function is how the
    // JS side checks the current state without showing the prompt again.
    AsyncFunction("canScheduleExactAlarms") {
      val context = appContext.reactContext ?: throw Error("Context not available")
      // SCHEDULE_EXACT_ALARM only exists on API 31+. Below that, exact
      // alarms are auto-permitted, so we report `true` to skip the prompt.
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
        return@AsyncFunction true
      }
      val am = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager
        ?: return@AsyncFunction false
      am.canScheduleExactAlarms()
    }
  }

  private fun drawableToBitmap(drawable: Drawable, sizePx: Int): Bitmap {
    if (drawable is BitmapDrawable && drawable.bitmap != null) {
      return Bitmap.createScaledBitmap(drawable.bitmap, sizePx, sizePx, true)
    }

    val bitmap = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    drawable.setBounds(0, 0, canvas.width, canvas.height)
    drawable.draw(canvas)
    return bitmap
  }
}
