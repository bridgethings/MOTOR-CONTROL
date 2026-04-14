/*
 * ota_manager.cpp - OTA Update Manager (SoftAP + Cloud via 4G)
 *
 * Adapted from Ref_BLE/OTAManager.cpp for 4G Motor Controller.
 * Cloud OTA uses raw HTTP over TinyGsmClient TCP (4G modem) since
 * ESP32's HTTPClient::begin() only accepts WiFiClient, not generic Client.
 */

#include "ota_manager.h"
#include "modem_handler.h"
#include <ArduinoJson.h>

// Global instance
OTAManager otaManager;

// ============================================================
// CONSTRUCTOR & INITIALIZATION
// ============================================================

OTAManager::OTAManager() {
    _state = OTA_IDLE;
    _webServer = nullptr;
    _responseCallback = nullptr;
    _stateStartTime = 0;
    _lastProgressReport = 0;
    _lastDataReceived = 0;
    _contentLength = 0;
    _bytesReceived = 0;
    _updateStarted = false;
    _useModemHTTP = false;
    _apTimeout = 300000;  // 5 minutes default

    _progress.state = OTA_IDLE;
    _progress.bytesWritten = 0;
    _progress.totalBytes = 0;
    _progress.percentage = 0;
    _progress.message = "";
    _progress.errorCode = OTA_ERR_NONE;
}

void OTAManager::begin() {
    Serial.println("[OTA] Manager initialized");
    Serial.printf("[OTA] Firmware: %s (built %s)\n", FW_VERSION, getBuildDate().c_str());
    Serial.printf("[OTA] Partition: %s\n", getPartitionInfo().c_str());
}

// ============================================================
// STATIC METHODS
// ============================================================

String OTAManager::getPartitionInfo() {
    const esp_partition_t* running = esp_ota_get_running_partition();
    if (running) {
        return String(running->label) + " @ 0x" + String(running->address, HEX);
    }
    return "unknown";
}

void OTAManager::markFirmwareValid() {
    const esp_partition_t* running = esp_ota_get_running_partition();
    esp_ota_img_states_t ota_state;

    if (esp_ota_get_state_partition(running, &ota_state) == ESP_OK) {
        if (ota_state == ESP_OTA_IMG_PENDING_VERIFY) {
            if (esp_ota_mark_app_valid_cancel_rollback() == ESP_OK) {
                Serial.println("[OTA] Firmware marked as valid");
            }
        }
    }
}

bool OTAManager::rollbackToPrevious() {
    Serial.println("[OTA] Rolling back to previous firmware...");
    esp_err_t err = esp_ota_mark_app_invalid_rollback_and_reboot();
    // If we get here, rollback failed
    Serial.printf("[OTA] Rollback failed: %d\n", err);
    return false;
}

// ============================================================
// STATE MANAGEMENT
// ============================================================

void OTAManager::setState(OTAState newState, const String& message, OTAErrorCode error) {
    _state = newState;
    _stateStartTime = millis();
    _progress.state = newState;
    _progress.message = message;
    _progress.errorCode = error;

    Serial.printf("[OTA] State -> %d: %s\n", newState, message.c_str());
    reportProgress();
}

void OTAManager::reportProgress() {
    if (!_responseCallback) return;

    StaticJsonDocument<384> doc;
    doc["type"] = "ota_progress";
    doc["state"] = _state;
    doc["progress"] = _progress.percentage;
    doc["bytes_written"] = _progress.bytesWritten;
    doc["total_bytes"] = _progress.totalBytes;
    doc["message"] = _progress.message;

    if (_progress.errorCode != OTA_ERR_NONE) {
        doc["error_code"] = _progress.errorCode;
    }

    String output;
    serializeJson(doc, output);
    sendResponse(output);

    _lastProgressReport = millis();
}

void OTAManager::sendResponse(const String& response) {
    if (_responseCallback) {
        _responseCallback(response + "\n");
    }
}

// ============================================================
// MAIN UPDATE LOOP
// ============================================================

void OTAManager::update() {
    switch (_state) {
        case OTA_IDLE:
            break;

        case OTA_AP_WAITING:
        case OTA_AP_RECEIVING:
            handleAPMode();
            break;

        case OTA_CLOUD_CONNECTING:
        case OTA_CLOUD_DOWNLOADING:
            if (_useModemHTTP) {
                handleModemHTTPDownload();
            } else {
                handleCloudDownload();
            }
            break;

        case OTA_COMPLETE:
            Serial.println("[OTA] Update complete, rebooting in 2 seconds...");
            delay(2000);
            ESP.restart();
            break;

        case OTA_ERROR:
            // Auto-cleanup after 30 seconds in error state
            if (millis() - _stateStartTime > 30000) {
                Serial.println("[OTA] Auto-cleanup after error timeout");
                cleanup();
            }
            break;

        default:
            break;
    }
}

// ============================================================
// SOFTAP MODE
// ============================================================

bool OTAManager::startAPMode(const String& ssid, const String& password, uint32_t timeoutMs) {
    if (_state != OTA_IDLE && _state != OTA_ERROR) {
        Serial.println("[OTA] Already in progress");
        return false;
    }

    if (_state == OTA_ERROR) {
        cleanup();
    }

    if (password.length() < 8) {
        Serial.println("[OTA] Password too short (min 8 chars)");
        return false;
    }

    _apSSID = ssid;
    _apPassword = password;
    _apTimeout = timeoutMs;

    setState(OTA_AP_STARTING, "Starting WiFi Access Point...");

    // Start SoftAP (ESP32 WiFi radio, independent of 4G modem)
    WiFi.disconnect(true);
    delay(100);

    WiFi.mode(WIFI_AP);
    if (!WiFi.softAP(_apSSID.c_str(), _apPassword.c_str())) {
        setState(OTA_ERROR, "Failed to start Access Point", OTA_ERR_AP_START_FAILED);
        return false;
    }

    delay(100);
    IPAddress IP = WiFi.softAPIP();
    Serial.printf("[OTA] AP IP: %s\n", IP.toString().c_str());

    setupWebServer();
    setState(OTA_AP_WAITING, "AP ready. Connect to WiFi '" + _apSSID + "' and open http://192.168.4.1");

    return true;
}

void OTAManager::setupWebServer() {
    if (_webServer) {
        delete _webServer;
    }

    _webServer = new WebServer(80);

    _webServer->on("/", HTTP_GET, [this]() {
        handleRoot();
    });

    _webServer->on("/upload", HTTP_POST, [this]() {
        if (Update.hasError()) {
            _webServer->send(500, "text/plain", "Update failed: " + String(Update.errorString()));
            setState(OTA_ERROR, "Update failed: " + String(Update.errorString()), OTA_ERR_WRITE_FAILED);
        } else {
            _webServer->send(200, "text/plain", "Update successful! Rebooting...");
            setState(OTA_COMPLETE, "Update successful, rebooting...");
        }
    }, [this]() {
        handleUpload();
    });

    _webServer->onNotFound([this]() {
        handleNotFound();
    });

    _webServer->begin();
    Serial.println("[OTA] Web server started on port 80");
}

void OTAManager::handleRoot() {
    _webServer->send(200, "text/html", generateUploadPage());
}

void OTAManager::handleUpload() {
    HTTPUpload& upload = _webServer->upload();

    if (upload.status == UPLOAD_FILE_START) {
        Serial.printf("[OTA] Receiving: %s\n", upload.filename.c_str());
        setState(OTA_AP_RECEIVING, "Receiving firmware: " + upload.filename);

        if (!Update.begin(UPDATE_SIZE_UNKNOWN)) {
            Serial.printf("[OTA] Update.begin failed: %s\n", Update.errorString());
            setState(OTA_ERROR, "Not enough space", OTA_ERR_NO_SPACE);
            return;
        }
        _updateStarted = true;
        _bytesReceived = 0;

    } else if (upload.status == UPLOAD_FILE_WRITE) {
        if (_updateStarted) {
            if (Update.write(upload.buf, upload.currentSize) != upload.currentSize) {
                Serial.printf("[OTA] Write failed: %s\n", Update.errorString());
                setState(OTA_ERROR, "Write failed", OTA_ERR_WRITE_FAILED);
                return;
            }
            _bytesReceived += upload.currentSize;
            _progress.bytesWritten = _bytesReceived;

            if (_contentLength > 0) {
                _progress.percentage = (_bytesReceived * 100) / _contentLength;
            }

            // Report every 500ms
            if (millis() - _lastProgressReport > 500) {
                Serial.printf("[OTA] Received %d bytes\n", _bytesReceived);
                reportProgress();
            }
        }

    } else if (upload.status == UPLOAD_FILE_END) {
        if (_updateStarted) {
            if (Update.end(true)) {
                Serial.printf("[OTA] Upload complete, %d bytes\n", upload.totalSize);
                _progress.bytesWritten = upload.totalSize;
                _progress.totalBytes = upload.totalSize;
                _progress.percentage = 100;
            } else {
                Serial.printf("[OTA] Update.end failed: %s\n", Update.errorString());
            }
        }
        _updateStarted = false;

    } else if (upload.status == UPLOAD_FILE_ABORTED) {
        if (_updateStarted) {
            Update.abort();
            _updateStarted = false;
        }
        setState(OTA_ERROR, "Upload aborted", OTA_ERR_CANCELLED);
    }
}

void OTAManager::handleNotFound() {
    _webServer->send(404, "text/plain", "Not Found. Go to http://192.168.4.1/");
}

void OTAManager::handleAPMode() {
    if (_webServer) {
        _webServer->handleClient();
    }

    // Check for timeout
    if (_state == OTA_AP_WAITING) {
        if (millis() - _stateStartTime > _apTimeout) {
            Serial.println("[OTA] AP mode timeout");
            cancel();
        }
    }
}

String OTAManager::generateUploadPage() {
    String html = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>4G Motor Controller - Firmware Update</title>
    <style>
        * { box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0; padding: 20px; background: #1a1a2e; color: #eee;
            min-height: 100vh;
        }
        .container {
            max-width: 500px; margin: 0 auto; background: #16213e;
            padding: 30px; border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        }
        h1 { color: #4fc3f7; font-size: 24px; margin-bottom: 5px; }
        .subtitle { color: #888; font-size: 14px; margin-bottom: 25px; }
        .version {
            background: #0f3460; padding: 15px; border-radius: 8px;
            margin-bottom: 20px;
        }
        .version-label { color: #888; font-size: 12px; }
        .version-value { color: #4fc3f7; font-size: 18px; font-weight: bold; }
        .warning {
            background: #ff9800; color: #000; padding: 15px;
            border-radius: 8px; margin-bottom: 20px; font-size: 14px;
        }
        .upload-area {
            border: 2px dashed #4fc3f7; border-radius: 8px;
            padding: 40px 20px; text-align: center;
            margin-bottom: 20px; cursor: pointer;
            transition: all 0.3s;
        }
        .upload-area:hover { background: rgba(79, 195, 247, 0.1); }
        .upload-area.dragover { background: rgba(79, 195, 247, 0.2); border-color: #fff; }
        input[type="file"] { display: none; }
        .file-name { color: #4fc3f7; margin-top: 10px; word-break: break-all; }
        button {
            width: 100%; padding: 15px; background: #4fc3f7; color: #000;
            border: none; border-radius: 8px; font-size: 16px;
            font-weight: bold; cursor: pointer; transition: all 0.3s;
        }
        button:hover { background: #81d4fa; }
        button:disabled { background: #555; color: #888; cursor: not-allowed; }
        .progress { display: none; margin-top: 20px; }
        .progress-bar {
            height: 24px; background: #0f3460; border-radius: 12px;
            overflow: hidden;
        }
        .progress-fill {
            height: 100%; background: linear-gradient(90deg, #4fc3f7, #4caf50);
            width: 0%; transition: width 0.3s;
            display: flex; align-items: center; justify-content: center;
            color: #000; font-weight: bold; font-size: 12px;
        }
        .status { margin-top: 15px; text-align: center; color: #888; }
        .status.success { color: #4caf50; }
        .status.error { color: #f44336; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Firmware Update</h1>
        <div class="subtitle">4G Motor Controller</div>

        <div class="version">
            <div class="version-label">Current Version</div>
            <div class="version-value">)rawliteral" + String(FW_VERSION) + R"rawliteral(</div>
        </div>

        <div class="warning">
            <strong>Warning:</strong> Do not disconnect power during update.
            Device will reboot automatically after successful update.
        </div>

        <form id="uploadForm" enctype="multipart/form-data">
            <div class="upload-area" id="uploadArea">
                <div>Click or drag firmware file here</div>
                <div style="color: #888; font-size: 12px; margin-top: 5px;">.bin file only</div>
                <div class="file-name" id="fileName"></div>
                <input type="file" name="firmware" id="firmware" accept=".bin">
            </div>
            <button type="submit" id="uploadBtn" disabled>Upload Firmware</button>
        </form>

        <div class="progress" id="progressDiv">
            <div class="progress-bar">
                <div class="progress-fill" id="progressFill">0%</div>
            </div>
            <div class="status" id="status">Uploading...</div>
        </div>
    </div>

    <script>
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('firmware');
        const fileName = document.getElementById('fileName');
        const uploadBtn = document.getElementById('uploadBtn');
        const uploadForm = document.getElementById('uploadForm');
        const progressDiv = document.getElementById('progressDiv');
        const progressFill = document.getElementById('progressFill');
        const status = document.getElementById('status');

        uploadArea.addEventListener('click', () => fileInput.click());

        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            if (e.dataTransfer.files.length) {
                fileInput.files = e.dataTransfer.files;
                updateFileName();
            }
        });

        fileInput.addEventListener('change', updateFileName);

        function updateFileName() {
            if (fileInput.files.length) {
                const file = fileInput.files[0];
                if (file.name.endsWith('.bin')) {
                    fileName.textContent = file.name + ' (' + (file.size / 1024).toFixed(1) + ' KB)';
                    uploadBtn.disabled = false;
                } else {
                    fileName.textContent = 'Error: Please select a .bin file';
                    uploadBtn.disabled = true;
                }
            }
        }

        uploadForm.addEventListener('submit', function(e) {
            e.preventDefault();

            const formData = new FormData(this);
            const xhr = new XMLHttpRequest();

            uploadBtn.disabled = true;
            progressDiv.style.display = 'block';
            status.className = 'status';
            status.textContent = 'Uploading...';

            xhr.upload.addEventListener('progress', function(e) {
                if (e.lengthComputable) {
                    const percent = Math.round((e.loaded / e.total) * 100);
                    progressFill.style.width = percent + '%';
                    progressFill.textContent = percent + '%';
                    status.textContent = 'Uploading: ' + (e.loaded / 1024).toFixed(0) + ' / ' + (e.total / 1024).toFixed(0) + ' KB';
                }
            });

            xhr.onload = function() {
                if (xhr.status === 200) {
                    progressFill.style.width = '100%';
                    progressFill.textContent = '100%';
                    progressFill.style.background = '#4caf50';
                    status.className = 'status success';
                    status.textContent = 'Update complete! Rebooting device...';
                } else {
                    progressFill.style.background = '#f44336';
                    status.className = 'status error';
                    status.textContent = 'Error: ' + xhr.responseText;
                    uploadBtn.disabled = false;
                }
            };

            xhr.onerror = function() {
                progressFill.style.background = '#f44336';
                status.className = 'status error';
                status.textContent = 'Network error. Please try again.';
                uploadBtn.disabled = false;
            };

            xhr.open('POST', '/upload');
            xhr.send(formData);
        });
    </script>
</body>
</html>
)rawliteral";
    return html;
}

// ============================================================
// CLOUD OTA (via 4G modem - raw HTTP over TinyGsmClient TCP)
// ============================================================

// Parse URL into host, port, path components
bool OTAManager::parseURL(const String& url, String& host, uint16_t& port, String& path) {
    // Only support http:// for 4G modem (TLS requires different handling)
    String working = url;

    if (working.startsWith("http://")) {
        working = working.substring(7);
        port = 80;
    } else if (working.startsWith("https://")) {
        // TinyGsmClient does not support TLS directly - would need TinyGsmClientSecure
        // For now, only HTTP is supported for cloud OTA via 4G
        working = working.substring(8);
        port = 443;
    } else {
        return false;
    }

    // Find path separator
    int pathIdx = working.indexOf('/');
    if (pathIdx == -1) {
        host = working;
        path = "/";
    } else {
        host = working.substring(0, pathIdx);
        path = working.substring(pathIdx);
    }

    // Check for port in host
    int portIdx = host.indexOf(':');
    if (portIdx != -1) {
        port = host.substring(portIdx + 1).toInt();
        host = host.substring(0, portIdx);
    }

    return host.length() > 0;
}

bool OTAManager::startCloudOTA(const String& url, const String& md5) {
    if (_state != OTA_IDLE && _state != OTA_ERROR) {
        Serial.println("[OTA] Already in progress");
        return false;
    }

    if (_state == OTA_ERROR) {
        cleanup();
    }

    // Validate URL
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
        setState(OTA_ERROR, "Invalid URL format", OTA_ERR_INVALID_URL);
        return false;
    }

    // Check network connectivity
    if (!modem_is_connected()) {
        setState(OTA_ERROR, "No network connection", OTA_ERR_NO_NETWORK);
        return false;
    }

    _downloadURL = url;
    _expectedMD5 = md5;
    _bytesReceived = 0;
    _contentLength = 0;
    _useModemHTTP = false;

    setState(OTA_CLOUD_CONNECTING, "Connecting to download server...");

    // Use modem's built-in HTTP client for HTTPS (TinyGsmClient doesn't support SSL)
    // Also use it for HTTP since it handles redirects automatically
    if (url.startsWith("https://") || url.indexOf("github.com") >= 0) {
        return startDownloadViaModemHTTP();
    }

    return startDownload();
}

bool OTAManager::startDownload() {
    Serial.printf("[OTA] Downloading from: %s\n", _downloadURL.c_str());

    // Parse URL
    String host, path;
    uint16_t port;
    if (!parseURL(_downloadURL, host, port, path)) {
        setState(OTA_ERROR, "Invalid URL", OTA_ERR_INVALID_URL);
        return false;
    }

    Serial.printf("[OTA] Host: %s, Port: %d, Path: %s\n", host.c_str(), port, path.c_str());

    // Connect via TinyGsmClient (routes through 4G modem)
    if (!gsm_client.connect(host.c_str(), port)) {
        Serial.println("[OTA] TCP connection failed");
        setState(OTA_ERROR, "Connection failed to " + host, OTA_ERR_CONNECTION_FAILED);
        return false;
    }

    // Send HTTP GET request
    gsm_client.print("GET " + path + " HTTP/1.1\r\n");
    gsm_client.print("Host: " + host + "\r\n");
    gsm_client.print("User-Agent: 4GMotorController/" FW_VERSION "\r\n");
    gsm_client.print("Connection: close\r\n");
    gsm_client.print("\r\n");

    // Read HTTP response headers
    unsigned long headerTimeout = millis();
    bool headersComplete = false;
    int httpStatus = 0;
    _contentLength = -1;

    while (millis() - headerTimeout < 30000 && gsm_client.connected()) {
        if (gsm_client.available()) {
            String line = gsm_client.readStringUntil('\n');
            line.trim();

            // Parse status line
            if (httpStatus == 0 && line.startsWith("HTTP/")) {
                int spaceIdx = line.indexOf(' ');
                if (spaceIdx > 0) {
                    httpStatus = line.substring(spaceIdx + 1, spaceIdx + 4).toInt();
                    Serial.printf("[OTA] HTTP status: %d\n", httpStatus);
                }
            }

            // Parse Content-Length
            if (line.startsWith("Content-Length:") || line.startsWith("content-length:")) {
                _contentLength = line.substring(line.indexOf(':') + 1).toInt();
            }

            // Empty line = end of headers
            if (line.length() == 0) {
                headersComplete = true;
                break;
            }

            headerTimeout = millis();  // Reset timeout on each header line
        }
        delay(1);
    }

    if (!headersComplete) {
        Serial.println("[OTA] Header read timeout");
        gsm_client.stop();
        setState(OTA_ERROR, "HTTP header timeout", OTA_ERR_DOWNLOAD_TIMEOUT);
        return false;
    }

    if (httpStatus != 200) {
        Serial.printf("[OTA] HTTP error: %d\n", httpStatus);
        gsm_client.stop();
        setState(OTA_ERROR, "HTTP error: " + String(httpStatus), OTA_ERR_HTTP_ERROR);
        return false;
    }

    if (_contentLength <= 0) {
        Serial.println("[OTA] Invalid or missing Content-Length");
        gsm_client.stop();
        setState(OTA_ERROR, "Invalid content length", OTA_ERR_INVALID_SIZE);
        return false;
    }

    Serial.printf("[OTA] Content length: %d bytes\n", _contentLength);
    _progress.totalBytes = _contentLength;

    // Check if firmware will fit
    if (!Update.begin(_contentLength)) {
        Serial.printf("[OTA] Not enough space: %s\n", Update.errorString());
        gsm_client.stop();
        setState(OTA_ERROR, "Not enough space for update", OTA_ERR_NO_SPACE);
        return false;
    }

    // Set MD5 if provided
    if (_expectedMD5.length() == 32) {
        Update.setMD5(_expectedMD5.c_str());
        Serial.printf("[OTA] MD5 verification enabled: %s\n", _expectedMD5.c_str());
    }

    _updateStarted = true;
    _lastDataReceived = millis();
    setState(OTA_CLOUD_DOWNLOADING, "Downloading firmware...");

    return true;
}

void OTAManager::handleCloudDownload() {
    if (_state == OTA_CLOUD_CONNECTING) {
        // startDownload() handles this synchronously
        return;
    }

    if (_state != OTA_CLOUD_DOWNLOADING) {
        return;
    }

    // Check for stall (no data for 30 seconds)
    if (millis() - _lastDataReceived > 30000) {
        Serial.println("[OTA] Download stalled");
        setState(OTA_ERROR, "Download timeout", OTA_ERR_DOWNLOAD_TIMEOUT);
        Update.abort();
        gsm_client.stop();
        _updateStarted = false;
        return;
    }

    // Read available data from TinyGsmClient
    size_t available = gsm_client.available();
    if (available > 0) {
        uint8_t buffer[1024];
        size_t toRead = (available < sizeof(buffer)) ? available : sizeof(buffer);
        size_t bytesRead = gsm_client.readBytes(buffer, toRead);

        if (bytesRead > 0) {
            _lastDataReceived = millis();

            size_t written = Update.write(buffer, bytesRead);
            if (written != bytesRead) {
                Serial.printf("[OTA] Write error: %s\n", Update.errorString());
                setState(OTA_ERROR, "Write failed", OTA_ERR_WRITE_FAILED);
                Update.abort();
                gsm_client.stop();
                _updateStarted = false;
                return;
            }

            _bytesReceived += bytesRead;
            _progress.bytesWritten = _bytesReceived;
            _progress.percentage = (_bytesReceived * 100) / _contentLength;

            // Report progress every second
            if (millis() - _lastProgressReport > 1000) {
                Serial.printf("[OTA] Progress %d%% (%d / %d bytes)\n",
                    _progress.percentage, _bytesReceived, _contentLength);
                reportProgress();
            }
        }
    }

    // Check if download complete
    if (_bytesReceived >= _contentLength) {
        gsm_client.stop();

        if (!Update.end(true)) {
            Serial.printf("[OTA] Finalize failed: %s\n", Update.errorString());

            if (String(Update.errorString()).indexOf("MD5") >= 0) {
                setState(OTA_ERROR, "MD5 verification failed", OTA_ERR_MD5_MISMATCH);
            } else {
                setState(OTA_ERROR, "Update finalization failed", OTA_ERR_WRITE_FAILED);
            }
            _updateStarted = false;
            return;
        }

        _progress.percentage = 100;
        _updateStarted = false;
        setState(OTA_COMPLETE, "Update complete, rebooting...");
    }

    // Check if connection dropped before download complete
    if (!gsm_client.connected() && _bytesReceived < _contentLength) {
        Serial.printf("[OTA] Connection lost at %d / %d bytes\n", _bytesReceived, _contentLength);
        setState(OTA_ERROR, "Connection lost during download", OTA_ERR_DOWNLOAD_INCOMPLETE);
        Update.abort();
        _updateStarted = false;
    }
}

// ============================================================
// MODEM AT-BASED HTTP/HTTPS DOWNLOAD
// Uses the modem's built-in HTTP client (AT+HTTP commands)
// which handles SSL/TLS and redirects natively.
// ============================================================

// Helper: send AT command and wait for expected response
static bool atSendWait(const String& cmd, const char* expect, int timeout_ms) {
    Serial2.println(cmd);
    return modem_wait_for(expect, "ERROR", true, timeout_ms);
}

bool OTAManager::startDownloadViaModemHTTP() {
    Serial.printf("[OTA] Using modem HTTP for: %s\n", _downloadURL.c_str());

    // Terminate any previous HTTP session
    Serial2.println("AT+HTTPTERM");
    delay(500);
    // Drain any pending data
    while (Serial2.available()) Serial2.read();

    // Init HTTP service
    if (!atSendWait("AT+HTTPINIT", "OK", 5000)) {
        setState(OTA_ERROR, "Modem HTTP init failed", OTA_ERR_CONNECTION_FAILED);
        return false;
    }

    // Set URL
    String urlCmd = "AT+HTTPPARA=\"URL\",\"" + _downloadURL + "\"";
    if (!atSendWait(urlCmd, "OK", 5000)) {
        Serial2.println("AT+HTTPTERM");
        setState(OTA_ERROR, "Failed to set URL", OTA_ERR_INVALID_URL);
        return false;
    }

    // Enable redirect following (GitHub redirects to raw.githubusercontent.com)
    atSendWait("AT+HTTPPARA=\"REDIR\",\"1\"", "OK", 3000);

    // Set User-Agent
    atSendWait("AT+HTTPPARA=\"UA\",\"4GMotorController/" FW_VERSION "\"", "OK", 3000);

    // Start GET request
    Serial2.println("AT+HTTPACTION=0");

    // Wait for +HTTPACTION URC (can take time for DNS + SSL handshake + redirects)
    // Format: +HTTPACTION: <method>,<statuscode>,<datalen>
    unsigned long actionStart = millis();
    int httpStatus = 0;
    int dataLen = 0;
    bool gotAction = false;

    while (millis() - actionStart < 120000) {  // 2 minute timeout
        if (Serial2.available()) {
            String line = Serial2.readStringUntil('\n');
            line.trim();
            if (line.length() > 0) {
                Serial.printf("[OTA-AT] %s\n", line.c_str());
            }
            if (line.startsWith("+HTTPACTION:")) {
                // Parse: +HTTPACTION: 0,200,<size>
                int idx1 = line.indexOf(',');
                int idx2 = line.indexOf(',', idx1 + 1);
                if (idx1 > 0 && idx2 > 0) {
                    httpStatus = line.substring(idx1 + 1, idx2).toInt();
                    dataLen = line.substring(idx2 + 1).toInt();
                }
                gotAction = true;
                break;
            }
        }
        delay(100);
    }

    if (!gotAction) {
        Serial.println("[OTA] HTTP action timeout");
        Serial2.println("AT+HTTPTERM");
        setState(OTA_ERROR, "HTTP request timeout", OTA_ERR_DOWNLOAD_TIMEOUT);
        return false;
    }

    if (httpStatus != 200) {
        Serial.printf("[OTA] HTTP error: %d\n", httpStatus);
        Serial2.println("AT+HTTPTERM");
        setState(OTA_ERROR, "HTTP error: " + String(httpStatus), OTA_ERR_HTTP_ERROR);
        return false;
    }

    if (dataLen <= 0) {
        Serial2.println("AT+HTTPTERM");
        setState(OTA_ERROR, "Empty response", OTA_ERR_INVALID_SIZE);
        return false;
    }

    Serial.printf("[OTA] HTTP OK: %d bytes to download\n", dataLen);
    _contentLength = dataLen;
    _progress.totalBytes = _contentLength;

    // Begin OTA update
    if (!Update.begin(_contentLength)) {
        Serial.printf("[OTA] Not enough space: %s\n", Update.errorString());
        Serial2.println("AT+HTTPTERM");
        setState(OTA_ERROR, "Not enough space", OTA_ERR_NO_SPACE);
        return false;
    }

    if (_expectedMD5.length() == 32) {
        Update.setMD5(_expectedMD5.c_str());
    }

    _updateStarted = true;
    _useModemHTTP = true;
    _lastDataReceived = millis();
    setState(OTA_CLOUD_DOWNLOADING, "Downloading firmware...");

    return true;
}

void OTAManager::handleModemHTTPDownload() {
    if (_state != OTA_CLOUD_DOWNLOADING) return;

    // Check for timeout (60s no data)
    if (millis() - _lastDataReceived > 60000) {
        Serial.println("[OTA] Modem HTTP download timeout");
        Serial2.println("AT+HTTPTERM");
        Update.abort();
        _updateStarted = false;
        setState(OTA_ERROR, "Download timeout", OTA_ERR_DOWNLOAD_TIMEOUT);
        return;
    }

    // Check if download complete
    if (_bytesReceived >= _contentLength) {
        Serial2.println("AT+HTTPTERM");

        if (!Update.end(true)) {
            Serial.printf("[OTA] Finalize failed: %s\n", Update.errorString());
            setState(OTA_ERROR, "Update finalization failed", OTA_ERR_WRITE_FAILED);
            _updateStarted = false;
            return;
        }

        _progress.percentage = 100;
        _updateStarted = false;
        setState(OTA_COMPLETE, "Update complete, rebooting...");
        return;
    }

    // Read next chunk via AT+HTTPREAD
    int remaining = _contentLength - _bytesReceived;
    int chunkSize = (remaining < 1024) ? remaining : 1024;

    char cmd[48];
    snprintf(cmd, sizeof(cmd), "AT+HTTPREAD=%d,%d", _bytesReceived, chunkSize);
    Serial2.println(cmd);

    // Wait for +HTTPREAD: <size> header
    unsigned long readStart = millis();
    int readLen = 0;
    bool gotHeader = false;

    while (millis() - readStart < 15000) {
        if (Serial2.available()) {
            String line = Serial2.readStringUntil('\n');
            line.trim();
            if (line.startsWith("+HTTPREAD:")) {
                // Parse: +HTTPREAD: <actual_len>
                readLen = line.substring(line.indexOf(':') + 1).toInt();
                gotHeader = true;
                break;
            } else if (line.indexOf("ERROR") >= 0) {
                Serial.printf("[OTA] HTTPREAD error: %s\n", line.c_str());
                Serial2.println("AT+HTTPTERM");
                Update.abort();
                _updateStarted = false;
                setState(OTA_ERROR, "HTTP read error", OTA_ERR_DOWNLOAD_TIMEOUT);
                return;
            }
        }
        delay(1);
    }

    if (!gotHeader || readLen <= 0) {
        // No data yet, will retry next loop iteration
        return;
    }

    // Read binary data (exact readLen bytes)
    uint8_t buffer[1024];
    int bytesRead = 0;
    unsigned long dataStart = millis();
    while (bytesRead < readLen && millis() - dataStart < 10000) {
        if (Serial2.available()) {
            buffer[bytesRead++] = Serial2.read();
        }
    }

    // Wait for trailing OK
    modem_wait_for("OK", "", false, 3000);

    if (bytesRead > 0) {
        _lastDataReceived = millis();

        size_t written = Update.write(buffer, bytesRead);
        if (written != (size_t)bytesRead) {
            Serial.printf("[OTA] Write error: %s\n", Update.errorString());
            Serial2.println("AT+HTTPTERM");
            Update.abort();
            _updateStarted = false;
            setState(OTA_ERROR, "Write failed", OTA_ERR_WRITE_FAILED);
            return;
        }

        _bytesReceived += bytesRead;
        _progress.bytesWritten = _bytesReceived;
        _progress.percentage = (_bytesReceived * 100) / _contentLength;

        if (millis() - _lastProgressReport > 2000) {
            Serial.printf("[OTA] Progress %d%% (%d / %d bytes)\n",
                _progress.percentage, _bytesReceived, _contentLength);
            reportProgress();
        }
    }
}

// ============================================================
// CANCEL & CLEANUP
// ============================================================

void OTAManager::cancel() {
    Serial.println("[OTA] Cancelling...");

    if (_updateStarted) {
        Update.abort();
        _updateStarted = false;
    }

    if (_state == OTA_CLOUD_DOWNLOADING || _state == OTA_CLOUD_CONNECTING) {
        if (_useModemHTTP) {
            Serial2.println("AT+HTTPTERM");
            delay(500);
        } else {
            gsm_client.stop();
        }
    }

    if (_state == OTA_AP_WAITING || _state == OTA_AP_RECEIVING) {
        stopAPMode();
    }

    cleanup();
    setState(OTA_IDLE, "OTA cancelled");
}

void OTAManager::stopAPMode() {
    if (_webServer) {
        _webServer->stop();
        delete _webServer;
        _webServer = nullptr;
    }

    WiFi.softAPdisconnect(true);
    WiFi.mode(WIFI_OFF);

    Serial.println("[OTA] AP mode stopped");
}

void OTAManager::cleanup() {
    _updateStarted = false;
    _useModemHTTP = false;

    if (_state == OTA_ERROR) {
        _state = OTA_IDLE;
        _progress.state = OTA_IDLE;
        _progress.errorCode = OTA_ERR_NONE;
    }
    _bytesReceived = 0;
    _contentLength = 0;
    _progress.bytesWritten = 0;
    _progress.totalBytes = 0;
    _progress.percentage = 0;
}
