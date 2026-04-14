/*
 * status_led.h - LED Status Indicator
 *
 * Non-blocking LED pattern generation for system status indication.
 * Adapted from reference StatusLED implementation.
 */

#ifndef STATUS_LED_H
#define STATUS_LED_H

#include <Arduino.h>

// LED timing constants (milliseconds)
#define LED_HEARTBEAT_ON1    50
#define LED_HEARTBEAT_OFF1   100
#define LED_HEARTBEAT_ON2    50
#define LED_HEARTBEAT_PAUSE  800

#define LED_SLOW_INTERVAL    1000
#define LED_FAST_INTERVAL    500

#define LED_DOUBLE_ON1       100
#define LED_DOUBLE_OFF1      150
#define LED_DOUBLE_ON2       100
#define LED_DOUBLE_PAUSE     600

#define LED_RAPID_INTERVAL   200

#define LED_SOS_DOT          200
#define LED_SOS_DASH         600
#define LED_SOS_GAP          200
#define LED_SOS_LETTER_GAP   600
#define LED_SOS_WORD_GAP     1200

// LED patterns
enum LEDPattern {
    LED_OFF,
    LED_ON,
    LED_HEARTBEAT,      // Two quick pulses - all OK
    LED_SLOW_BLINK,     // No network connection
    LED_FAST_BLINK,     // MQTT disconnected
    LED_DOUBLE_BLINK,   // Modbus communication errors
    LED_RAPID,          // OTA update active
    LED_SOS             // Critical system error
};

// System status for automatic pattern calculation
struct SystemStatus {
    bool networkConnected = false;
    bool mqttConnected    = false;
    bool modbusHealthy    = true;
    bool otaActive        = false;
    bool criticalError    = false;
};

class StatusLED {
public:
    StatusLED(uint8_t pin, bool activeHigh = true);

    void begin();
    void update();

    void setStatus(const SystemStatus& status);
    void setPattern(LEDPattern pattern);    // Manual override
    void clearOverride();                    // Return to auto pattern
    LEDPattern getCurrentPattern();
    String getStatusDescription();
    static String getPatternName(LEDPattern pattern);

private:
    uint8_t       _pin;
    bool          _activeHigh;
    LEDPattern    _currentPattern;
    LEDPattern    _overridePattern;
    bool          _overrideActive;
    unsigned long _lastToggle;
    uint8_t       _patternStep;
    bool          _ledState;
    uint8_t       _sosIndex;
    SystemStatus  _status;

    void setLED(bool on);
    LEDPattern calculatePattern();
    void updatePattern();
    void updateHeartbeat();
    void updateSlowBlink();
    void updateFastBlink();
    void updateDoubleBlink();
    void updateRapid();
    void updateSOS();
};

#endif // STATUS_LED_H
