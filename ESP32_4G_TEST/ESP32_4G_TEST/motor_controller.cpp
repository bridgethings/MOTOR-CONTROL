/*
 * motor_controller.cpp - Single Relay Control + Level Tracking
 *
 * Uses RELAY1_PIN for continuous motor state based on level limits.
 */

#include "motor_controller.h"
#include "config.h"
#include "config_manager.h"
#include "rtc_handler.h"
#include "mqtt_handler.h"
#include <Preferences.h>
#include <math.h>

static bool        _motorRunning       = false;
static float       _lastLevelReading   = 0;
static Preferences _motorPrefs;

// ============================================================
//  MOTOR CONTROL
// ============================================================

void motor_init() {
    pinMode(RELAY1_PIN, OUTPUT);
    digitalWrite(RELAY1_PIN, RELAY_ACTIVE_HIGH ? LOW : HIGH); // Default to off until logic says otherwise

    _motorPrefs.begin("motor", true);
    bool _wasRunning  = _motorPrefs.getBool("motor_was_on", false);
    _lastLevelReading = _motorPrefs.getFloat("last_level", 0);
    _motorPrefs.end();

    Serial.printf("[MOTOR] Initialized - Power loss recovery resuming state (was: %s, last level: %.2f)\n", _wasRunning ? "ON" : "OFF", _lastLevelReading);
    
    // Recovery Logic (Option 1): Resume the physical relay state based on software memory
    // Ensures physical relays correctly reflect the stored state
    if (_wasRunning) {
        _motorRunning = false; 
        motor_set_state(true); // Fire up the motor
    } else {
        _motorRunning = true; 
        motor_set_state(false); // Make sure it stays safely off
    }
}

bool motor_set_state(bool on) {
    if (_motorRunning == on) return true; // Already in desired state

    _motorRunning = on;
    
    if (on) {
        Serial.println("[MOTOR] >>> Turning ON relay");
        digitalWrite(RELAY1_PIN, RELAY_ACTIVE_HIGH ? HIGH : LOW);
    } else {
        Serial.println("[MOTOR] >>> Turning OFF relay");
        digitalWrite(RELAY1_PIN, RELAY_ACTIVE_HIGH ? LOW : HIGH);
    }

    // Persist motor state
    _motorPrefs.begin("motor", false);
    _motorPrefs.putBool("motor_was_on", _motorRunning);
    _motorPrefs.end();

    // Immediate telemetry update
    if (mqtt_is_connected()) {
        char telBuf[64];
        snprintf(telBuf, sizeof(telBuf), "{\"motor_running\":%s}", _motorRunning ? "true" : "false");
        mqtt_send_telemetry(telBuf);
    }

    return true;
}

void motor_update() {
    // Kept for structure, no pulse timers needed anymore
}

bool motor_is_running() {
    return _motorRunning;
}

bool motor_is_busy() {
    // Single relay implementation does not have busy pulsing states
    return false;
}

// ============================================================
//  LEVEL TRACKING
// ============================================================

void level_check(float currentLevel) {
    if (isnan(currentLevel)) return;

    _lastLevelReading = currentLevel;

    _motorPrefs.begin("motor", false);
    _motorPrefs.putFloat("last_level", _lastLevelReading);
    _motorPrefs.end();

    // Enforce Level thresholds
    if (motorConfig.level_high_threshold > 0 && currentLevel >= motorConfig.level_high_threshold) {
        if (_motorRunning) {
            Serial.printf("[LEVEL] High threshold reached (%.2f >= %.2f) - Turning OFF motor\n", currentLevel, motorConfig.level_high_threshold);
            motor_set_state(false);
        }
    } 
    else if (motorConfig.level_low_threshold > 0 && currentLevel <= motorConfig.level_low_threshold) {
        if (!_motorRunning && motorConfig.auto_turn_on) {  // Only turn on if auto_turn_on enabled? Or maybe always? Assuming auto
            Serial.printf("[LEVEL] Low threshold reached (%.2f <= %.2f) - Turning ON motor\n", currentLevel, motorConfig.level_low_threshold);
            motor_set_state(true);
        }
    }
}

float level_get_current() {
    return _lastLevelReading;
}
