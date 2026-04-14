/*
 * ota_manager.h - OTA Update Manager (SoftAP + Cloud via 4G)
 *
 * Supports:
 * - Local OTA via SoftAP + WebServer (WiFi hotspot upload)
 * - Cloud OTA via HTTP download through 4G modem (TinyGsmClient)
 * - Dual OTA partitions for rollback capability
 * - Progress reporting via BLE/MQTT
 *
 * Adapted from Ref_BLE/OTAManager for 4G Motor Controller.
 */

#ifndef OTA_MANAGER_H
#define OTA_MANAGER_H

#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <Update.h>
#include <esp_ota_ops.h>
#include "config.h"

// OTA States
enum OTAState {
    OTA_IDLE,
    OTA_AP_STARTING,
    OTA_AP_WAITING,
    OTA_AP_RECEIVING,
    OTA_CLOUD_CONNECTING,
    OTA_CLOUD_DOWNLOADING,
    OTA_COMPLETE,
    OTA_ERROR
};

// OTA Error Codes
enum OTAErrorCode {
    OTA_ERR_NONE = 0,
    OTA_ERR_NO_NETWORK         = 5001,
    OTA_ERR_CONNECTION_FAILED  = 5003,
    OTA_ERR_HTTP_ERROR         = 5004,
    OTA_ERR_DOWNLOAD_TIMEOUT   = 5005,
    OTA_ERR_DOWNLOAD_INCOMPLETE = 5006,
    OTA_ERR_INVALID_URL        = 5101,
    OTA_ERR_INVALID_SIZE       = 5102,
    OTA_ERR_MD5_MISMATCH       = 5103,
    OTA_ERR_NO_SPACE           = 5201,
    OTA_ERR_WRITE_FAILED       = 5202,
    OTA_ERR_PARTITION_ERROR    = 5203,
    OTA_ERR_AP_START_FAILED    = 5301,
    OTA_ERR_TIMEOUT            = 5303,
    OTA_ERR_CANCELLED          = 5304
};

// OTA Progress structure
struct OTAProgress {
    OTAState     state;
    uint32_t     bytesWritten;
    uint32_t     totalBytes;
    uint8_t      percentage;
    String       message;
    OTAErrorCode errorCode;
};

// Callback for sending progress to BLE/MQTT
typedef void (*OTASendResponseCallback)(String response);

class OTAManager {
public:
    OTAManager();

    void begin();
    void update();

    // Start SoftAP OTA mode (local WiFi upload)
    bool startAPMode(const String& ssid, const String& password, uint32_t timeoutMs = 300000);

    // Start Cloud OTA download (via 4G modem)
    bool startCloudOTA(const String& url, const String& md5 = "");

    // Cancel / stop OTA
    void cancel();

    // State queries
    OTAState    getState()    { return _state; }
    OTAProgress getProgress() { return _progress; }
    bool        isActive()    { return _state != OTA_IDLE && _state != OTA_ERROR; }
    bool        isInAPMode()  { return _state == OTA_AP_WAITING || _state == OTA_AP_RECEIVING; }

    // Response callback for BLE/MQTT progress reporting
    void setResponseCallback(OTASendResponseCallback cb) { _responseCallback = cb; }

    // Firmware info
    static String getCurrentVersion() { return FW_VERSION; }
    static String getBuildDate()      { return String(__DATE__) + " " + String(__TIME__); }
    static String getPartitionInfo();

    // Rollback to previous firmware
    static bool rollbackToPrevious();

    // Mark current firmware as valid (call after successful boot)
    static void markFirmwareValid();

    // AP info when active
    String getAPSSID() { return _apSSID; }
    String getAPIP()   { return "192.168.4.1"; }

private:
    OTAState     _state;
    OTAProgress  _progress;
    OTASendResponseCallback _responseCallback;

    // AP mode
    String     _apSSID;
    String     _apPassword;
    uint32_t   _apTimeout;
    WebServer* _webServer;

    // Cloud OTA
    String     _downloadURL;
    String     _expectedMD5;
    unsigned long _lastDataReceived;

    // Timing
    unsigned long _stateStartTime;
    unsigned long _lastProgressReport;

    // Upload/download state
    int  _contentLength;
    int  _bytesReceived;
    bool _updateStarted;

    // Internal methods
    void setState(OTAState newState, const String& message = "", OTAErrorCode error = OTA_ERR_NONE);
    void reportProgress();
    void sendResponse(const String& response);

    // AP mode handlers
    void   handleAPMode();
    void   setupWebServer();
    void   handleRoot();
    void   handleUpload();
    void   handleNotFound();
    String generateUploadPage();

    // Cloud OTA handlers
    void handleCloudDownload();
    bool startDownload();
    bool parseURL(const String& url, String& host, uint16_t& port, String& path);

    // Modem AT-based HTTP/HTTPS download (handles SSL + redirects natively)
    bool startDownloadViaModemHTTP();
    void handleModemHTTPDownload();
    bool _useModemHTTP;

    // Cleanup
    void cleanup();
    void stopAPMode();
};

// Global instance
extern OTAManager otaManager;

#endif // OTA_MANAGER_H
