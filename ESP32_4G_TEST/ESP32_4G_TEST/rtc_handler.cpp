/*
 * rtc_handler.cpp - PCF85063 RTC Driver Implementation
 *
 * Uses PCF85063TP library on I2C (SDA=6, SCL=7).
 * Based on reference code RTC patterns.
 */

#include "rtc_handler.h"
#include "config.h"
#include <Wire.h>
#include <PCF85063TP.h>

static PCD85063TP rtc;
static bool _rtcAvailable = false;

bool rtc_init() {
    Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
    delay(100);

    // Check if RTC is present at address 0x51
    Wire.beginTransmission(0x51);
    uint8_t error = Wire.endTransmission();

    if (error != 0) {
        Serial.println("[RTC] PCF85063 not detected on I2C (0x51)");
        _rtcAvailable = false;
        return false;
    }

    rtc.begin();
    _rtcAvailable = true;

    // Read current time and print it
    rtc.getTime();
    int year = rtc.year + 2000;

    if (year >= 2024) {
        Serial.printf("[RTC] Time: %04d-%02d-%02d %02d:%02d:%02d\n",
            year, rtc.month, rtc.dayOfMonth,
            rtc.hour, rtc.minute, rtc.second);

        // Set system time from RTC.
        // mktime() treats struct tm as UTC (no TZ env on ESP32), but RTC holds
        // local time (IST = UTC+5:30). Subtract TIMEZONE_OFFSET_SEC so the
        // system clock holds true UTC.
        struct tm timeinfo = {};
        timeinfo.tm_year = year - 1900;
        timeinfo.tm_mon  = rtc.month - 1;
        timeinfo.tm_mday = rtc.dayOfMonth;
        timeinfo.tm_hour = rtc.hour;
        timeinfo.tm_min  = rtc.minute;
        timeinfo.tm_sec  = rtc.second;
        time_t t = mktime(&timeinfo) - TIMEZONE_OFFSET_SEC;
        struct timeval tv = { .tv_sec = t, .tv_usec = 0 };
        settimeofday(&tv, NULL);
    } else {
        Serial.println("[RTC] Warning: RTC time not set (invalid year)");
    }

    Serial.println("[RTC] Initialized");
    return true;
}

bool rtc_get_time(int &year, int &month, int &day, int &hour, int &minute, int &second) {
    if (!_rtcAvailable) return false;

    rtc.getTime();
    year   = rtc.year + 2000;
    month  = rtc.month;
    day    = rtc.dayOfMonth;
    hour   = rtc.hour;
    minute = rtc.minute;
    second = rtc.second;
    return true;
}

bool rtc_set_time(int year, int month, int day, int hour, int minute, int second) {
    if (!_rtcAvailable) return false;

    rtc.stopClock();
    rtc.fillByYMD(year, month, day);  // library internally does _year - 2000
    rtc.fillByHMS(hour, minute, second);
    rtc.setTime();
    rtc.startClock();

    // Also update system time
    struct tm timeinfo = {};
    timeinfo.tm_year = year - 1900;
    timeinfo.tm_mon  = month - 1;
    timeinfo.tm_mday = day;
    timeinfo.tm_hour = hour;
    timeinfo.tm_min  = minute;
    timeinfo.tm_sec  = second;
    time_t t = mktime(&timeinfo);
    struct timeval tv = { .tv_sec = t, .tv_usec = 0 };
    settimeofday(&tv, NULL);

    Serial.printf("[RTC] Time set to: %04d-%02d-%02d %02d:%02d:%02d\n",
        year, month, day, hour, minute, second);
    return true;
}

unsigned long rtc_get_timestamp() {
    // Returns UTC Unix timestamp.
    // RTC stores local time (IST). mktime() on ESP32 has no TZ configured so it
    // treats struct tm as UTC. Subtract TIMEZONE_OFFSET_SEC to get correct UTC.
    if (_rtcAvailable) {
        rtc.getTime();
        int year = rtc.year + 2000;
        if (year >= 2024) {
            struct tm timeinfo = {};
            timeinfo.tm_year = year - 1900;
            timeinfo.tm_mon  = rtc.month - 1;
            timeinfo.tm_mday = rtc.dayOfMonth;
            timeinfo.tm_hour = rtc.hour;
            timeinfo.tm_min  = rtc.minute;
            timeinfo.tm_sec  = rtc.second;
            return (unsigned long)(mktime(&timeinfo) - TIMEZONE_OFFSET_SEC);
        }
    }

    // Fallback to system time (already corrected to UTC in rtc_init)
    time_t now;
    time(&now);
    if (now > 1700000000) return (unsigned long)now;

    // Ultimate fallback
    return millis() / 1000;
}

String rtc_get_datetime_string() {
    int year, month, day, hour, minute, second;
    if (rtc_get_time(year, month, day, hour, minute, second)) {
        char buf[20];
        snprintf(buf, sizeof(buf), "%04d-%02d-%02d %02d:%02d:%02d",
            year, month, day, hour, minute, second);
        return String(buf);
    }

    // Fallback to system time
    time_t now;
    time(&now);
    struct tm* timeinfo = localtime(&now);
    char buf[20];
    strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M:%S", timeinfo);
    return String(buf);
}

bool rtc_is_valid() {
    if (!_rtcAvailable) return false;
    rtc.getTime();
    return (rtc.year + 2000) >= 2024;
}

bool rtc_is_available() {
    return _rtcAvailable;
}
