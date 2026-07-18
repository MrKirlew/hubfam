package expo.modules.bleperipheral

import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothGattServer
import android.bluetooth.BluetoothGattServerCallback
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.BluetoothLeAdvertiser
import android.content.Context
import android.os.Build
import android.os.ParcelUuid
import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.UUID

/**
 * GATT peripheral for the FamilyHub BLE lane. Advertises the household service
 * UUID; the companion (central) writes frames to the WRITE characteristic and
 * subscribes to notifications on the NOTIFY characteristic. Frames are opaque
 * base64 (already sealed + MTU-chunked by the shared BleTransport).
 *
 * BLUETOOTH_ADVERTISE / BLUETOOTH_CONNECT are requested at runtime on the JS
 * side before start() is called, hence @SuppressLint("MissingPermission").
 */
@SuppressLint("MissingPermission")
class BlePeripheralModule : Module() {
  private val CCCD_UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

  private var gattServer: BluetoothGattServer? = null
  private var advertiser: BluetoothLeAdvertiser? = null
  private var advertiseCallback: AdvertiseCallback? = null
  private var notifyChar: BluetoothGattCharacteristic? = null
  private var central: BluetoothDevice? = null
  private var advServiceUuid: UUID? = null

  override fun definition() = ModuleDefinition {
    Name("BlePeripheral")
    Events("onFrame", "onConnectionChange")

    AsyncFunction("start") { serviceUuid: String, writeUuid: String, notifyUuid: String ->
      startServer(UUID.fromString(serviceUuid), UUID.fromString(writeUuid), UUID.fromString(notifyUuid))
    }

    AsyncFunction("stop") {
      stopServer()
    }

    Function("isConnected") {
      central != null
    }

    AsyncFunction("sendFrame") { base64: String ->
      sendFrame(base64)
    }

    OnDestroy {
      stopServer()
    }
  }

  private val context: Context
    get() = appContext.reactContext ?: throw Exception("No React context")

  private fun startServer(serviceUuid: UUID, writeUuid: UUID, notifyUuid: UUID) {
    if (gattServer != null) stopServer()

    val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
      ?: throw Exception("BluetoothManager unavailable")
    val adapter = manager.adapter ?: throw Exception("No Bluetooth adapter")
    if (!adapter.isEnabled) throw Exception("Bluetooth is turned off")

    val server = manager.openGattServer(context, gattCallback(writeUuid))
      ?: throw Exception("Could not open GATT server")

    val service = BluetoothGattService(serviceUuid, BluetoothGattService.SERVICE_TYPE_PRIMARY)
    val write = BluetoothGattCharacteristic(
      writeUuid,
      BluetoothGattCharacteristic.PROPERTY_WRITE or BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE,
      BluetoothGattCharacteristic.PERMISSION_WRITE,
    )
    val notify = BluetoothGattCharacteristic(
      notifyUuid,
      BluetoothGattCharacteristic.PROPERTY_NOTIFY,
      BluetoothGattCharacteristic.PERMISSION_READ,
    )
    notify.addDescriptor(
      BluetoothGattDescriptor(
        CCCD_UUID,
        BluetoothGattDescriptor.PERMISSION_READ or BluetoothGattDescriptor.PERMISSION_WRITE,
      ),
    )
    service.addCharacteristic(write)
    service.addCharacteristic(notify)
    server.addService(service)

    gattServer = server
    notifyChar = notify
    advServiceUuid = serviceUuid

    startAdvertising(serviceUuid)
  }

  /**
   * (Re)start connectable advertising for the service. Safe to call again after a
   * central disconnects: Android stops advertising once a connection is
   * established, so the hub must re-advertise to stay discoverable for the next
   * (or reconnecting) phone. Stops any prior advertiser first so it's idempotent.
   */
  private fun startAdvertising(serviceUuid: UUID) {
    val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager ?: return
    val adapter = manager.adapter ?: return
    if (!adapter.isEnabled) return
    val bleAdvertiser = adapter.bluetoothLeAdvertiser ?: return
    advertiseCallback?.let { prev -> try { bleAdvertiser.stopAdvertising(prev) } catch (_: Exception) {} }
    val settings = AdvertiseSettings.Builder()
      .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
      .setConnectable(true)
      .setTimeout(0)
      .build()
    val data = AdvertiseData.Builder()
      .setIncludeDeviceName(false)
      .addServiceUuid(ParcelUuid(serviceUuid))
      .build()
    val cb = object : AdvertiseCallback() {}
    bleAdvertiser.startAdvertising(settings, data, cb)
    advertiser = bleAdvertiser
    advertiseCallback = cb
  }

  private fun gattCallback(writeUuid: UUID) = object : BluetoothGattServerCallback() {
    override fun onConnectionStateChange(device: BluetoothDevice, status: Int, newState: Int) {
      if (newState == BluetoothProfile.STATE_CONNECTED) {
        central = device
        this@BlePeripheralModule.sendEvent("onConnectionChange", mapOf("connected" to true))
      } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
        if (device.address == central?.address) central = null
        this@BlePeripheralModule.sendEvent("onConnectionChange", mapOf("connected" to (central != null)))
        // Once no central is connected, resume advertising so the hub is
        // discoverable again for the next / reconnecting phone.
        if (central == null) advServiceUuid?.let { uuid -> try { startAdvertising(uuid) } catch (_: Exception) {} }
      }
    }

    override fun onCharacteristicWriteRequest(
      device: BluetoothDevice,
      requestId: Int,
      characteristic: BluetoothGattCharacteristic,
      preparedWrite: Boolean,
      responseNeeded: Boolean,
      offset: Int,
      value: ByteArray,
    ) {
      if (characteristic.uuid == writeUuid) {
        this@BlePeripheralModule.sendEvent("onFrame", mapOf("data" to Base64.encodeToString(value, Base64.NO_WRAP)))
      }
      if (responseNeeded) {
        gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, null)
      }
    }

    override fun onDescriptorWriteRequest(
      device: BluetoothDevice,
      requestId: Int,
      descriptor: BluetoothGattDescriptor,
      preparedWrite: Boolean,
      responseNeeded: Boolean,
      offset: Int,
      value: ByteArray,
    ) {
      // CCCD subscribe/unsubscribe — just acknowledge.
      if (responseNeeded) {
        gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, null)
      }
    }
  }

  private fun sendFrame(base64: String) {
    val device = central ?: throw Exception("No central connected")
    val ch = notifyChar ?: throw Exception("Peripheral not started")
    val bytes = Base64.decode(base64, Base64.NO_WRAP)
    val server = gattServer ?: throw Exception("Peripheral not started")
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      server.notifyCharacteristicChanged(device, ch, false, bytes)
    } else {
      @Suppress("DEPRECATION")
      ch.value = bytes
      @Suppress("DEPRECATION")
      server.notifyCharacteristicChanged(device, ch, false)
    }
  }

  private fun stopServer() {
    try {
      advertiseCallback?.let { advertiser?.stopAdvertising(it) }
    } catch (_: Exception) {
    }
    try {
      gattServer?.close()
    } catch (_: Exception) {
    }
    advertiser = null
    advertiseCallback = null
    gattServer = null
    notifyChar = null
    central = null
    advServiceUuid = null
  }
}
