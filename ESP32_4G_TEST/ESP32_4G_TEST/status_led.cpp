/*
 * status_led.cpp - LED Status Indicator Implementation
 *
 * Non-blocking LED pattern generation for system status indication.
 * Adapted from reference StatusLED implementation.
 */

#include "status_led.h"

// SOS pattern: S (3 dots), O (3 dashes), S (3 dots)
static const int16_t SOS_PATTERN[] = {
    LED_SOS_DOT, -LED_SOS_GAP,
    LED_SOS_DOT, -LED_SOS_GAP,
    LED_SOS_DOT, -LED_SOS_LETTER_GAP,
    LED_SOS_DASH, -LED_SOS_GAP,
    LED_SOS_DASH, -LED_SOS_GAP,
    LED_SOS_DASH, -LED_SOS_LETTER_GAP,
    LED_SOS_DOT, -LED_SOS_GAP,
    LED_SOS_DOT, -LED_SOS_GAP,
    LED_SOS_DOT, -LED_SOS_WORD_GAP
};
static const uint8_t SOS_PATTERN_LENGTH = sizeof(SOS_PATTERN) / sizeof(SOS_PATTERN[0]);

StatusLED::StatusLED(uint8_t pin, bool activeHigh)
    : _pin(pin)
    , _activeHigh(activeHigh)
    , _currentPattern(LED_OFF)
    , _overridePattern(LED_OFF)
    , _overrideActive(false)
    , _lastToggle(0)
    , _patternStep(0)
    , _ledState(false)
    , _sosIndex(0)
{
}

void StatusLED::begin() {
    pinMode(_pin, OUTPUT);
    setLED(false);
    _lastToggle = millis();
    Serial.println("[LED] StatusLED initialized on GPIO" + String(_pin));
}

void StatusLED::setLED(bool on) {
    _ledState = on;
    digitalWrite(_pin, (_activeHigh ? on : !on) ? HIGH : LOW);
}

void StatusLED::update() {
    LEDPattern targetPattern = _overrideActive ? _overridePattern : calculatePattern();

    if (targetPattern != _currentPattern) {
        _currentPattern = targetPattern;
        _patternStep = 0;
        _sosIndex = 0;
        _lastToggle = millis();
    }

    updatePattern();
}

void StatusLED::setStatus(const SystemStatus& status) {
    _status = status;
}

void StatusLED::setPattern(LEDPattern pattern) {
    _overridePattern = pattern;
    _overrideActive = true;
}

void StatusLED::clearOverride() {
    _overrideActive = false;
}

LEDPattern StatusLED::getCurrentPattern() {
    return _currentPattern;
}

LEDPattern StatusLED::calculatePattern() {
    if (_status.otaActive) return LED_RAPID;
    if (_status.criticalError) return LED_SOS;
    if (!_status.networkConnected) return LED_SLOW_BLINK;
    if (!_status.mqttConnected) return LED_FAST_BLINK;
    if (!_status.modbusHealthy) return LED_DOUBLE_BLINK;
    return LED_HEARTBEAT;
}

void StatusLED::updatePattern() {
    switch (_currentPattern) {
        case LED_OFF:         setLED(false); break;
        case LED_ON:          setLED(true); break;
        case LED_HEARTBEAT:   updateHeartbeat(); break;
        case LED_SLOW_BLINK:  updateSlowBlink(); break;
        case LED_FAST_BLINK:  updateFastBlink(); break;
        case LED_DOUBLE_BLINK: updateDoubleBlink(); break;
        case LED_RAPID:       updateRapid(); break;
        case LED_SOS:         updateSOS(); break;
    }
}

void StatusLED::updateHeartbeat() {
    unsigned long now = millis();
    unsigned long elapsed = now - _lastToggle;

    switch (_patternStep) {
        case 0:
            if (!_ledState) setLED(true);
            if (elapsed >= LED_HEARTBEAT_ON1) { _patternStep = 1; _lastToggle = now; }
            break;
        case 1:
            if (_ledState) setLED(false);
            if (elapsed >= LED_HEARTBEAT_OFF1) { _patternStep = 2; _lastToggle = now; }
            break;
        case 2:
            if (!_ledState) setLED(true);
            if (elapsed >= LED_HEARTBEAT_ON2) { _patternStep = 3; _lastToggle = now; }
            break;
        case 3:
            if (_ledState) setLED(false);
            if (elapsed >= LED_HEARTBEAT_PAUSE) { _patternStep = 0; _lastToggle = now; }
            break;
    }
}

void StatusLED::updateSlowBlink() {
    if (millis() - _lastToggle >= LED_SLOW_INTERVAL) {
        setLED(!_ledState);
        _lastToggle = millis();
    }
}

void StatusLED::updateFastBlink() {
    if (millis() - _lastToggle >= LED_FAST_INTERVAL) {
        setLED(!_ledState);
        _lastToggle = millis();
    }
}

void StatusLED::updateDoubleBlink() {
    unsigned long now = millis();
    unsigned long elapsed = now - _lastToggle;

    switch (_patternStep) {
        case 0:
            if (!_ledState) setLED(true);
            if (elapsed >= LED_DOUBLE_ON1) { _patternStep = 1; _lastToggle = now; }
            break;
        case 1:
            if (_ledState) setLED(false);
            if (elapsed >= LED_DOUBLE_OFF1) { _patternStep = 2; _lastToggle = now; }
            break;
        case 2:
            if (!_ledState) setLED(true);
            if (elapsed >= LED_DOUBLE_ON2) { _patternStep = 3; _lastToggle = now; }
            break;
        case 3:
            if (_ledState) setLED(false);
            if (elapsed >= LED_DOUBLE_PAUSE) { _patternStep = 0; _lastToggle = now; }
            break;
    }
}

void StatusLED::updateRapid() {
    if (millis() - _lastToggle >= LED_RAPID_INTERVAL) {
        setLED(!_ledState);
        _lastToggle = millis();
    }
}

void StatusLED::updateSOS() {
    unsigned long now = millis();
    int16_t timing = SOS_PATTERN[_sosIndex];
    unsigned long duration = abs(timing);

    if (now - _lastToggle >= duration) {
        _sosIndex = (_sosIndex + 1) % SOS_PATTERN_LENGTH;
        _lastToggle = now;
        timing = SOS_PATTERN[_sosIndex];
        setLED(timing > 0);
    }
}

String StatusLED::getStatusDescription() {
    switch (_currentPattern) {
        case LED_OFF:          return "LED Off";
        case LED_ON:           return "LED On";
        case LED_HEARTBEAT:    return "All Systems OK";
        case LED_SLOW_BLINK:   return "No Network Connection";
        case LED_FAST_BLINK:   return "MQTT Disconnected";
        case LED_DOUBLE_BLINK: return "Modbus Communication Errors";
        case LED_RAPID:        return "OTA Update Active";
        case LED_SOS:          return "Critical System Error";
        default:               return "Unknown";
    }
}

String StatusLED::getPatternName(LEDPattern pattern) {
    switch (pattern) {
        case LED_OFF:          return "OFF";
        case LED_ON:           return "ON";
        case LED_HEARTBEAT:    return "HEARTBEAT";
        case LED_SLOW_BLINK:   return "SLOW_BLINK";
        case LED_FAST_BLINK:   return "FAST_BLINK";
        case LED_DOUBLE_BLINK: return "DOUBLE_BLINK";
        case LED_RAPID:        return "RAPID";
        case LED_SOS:          return "SOS";
        default:               return "UNKNOWN";
    }
}
