/*
 * motor_controller.h - Non-blocking Motor Control via Relay + Level Tracking
 *
 * Controls motor start/stop using a continuous relay output based on level limits.
 */

#ifndef MOTOR_CONTROLLER_H
#define MOTOR_CONTROLLER_H

#include <Arduino.h>

// Initialize motor controller pins and restore state
void motor_init();

// Request motor state change (ON or OFF)
bool motor_set_state(bool on);

// Must be called in loop() (kept for compatibility)
void motor_update();

// Get current motor running state
bool motor_is_running();

// Backward compatibility: dummy busy state
bool motor_is_busy();

// Check level thresholds after a Modbus read cycle
// currentLevel: latest level sensor reading
void level_check(float currentLevel);

// Get the last read level
float level_get_current();

#endif // MOTOR_CONTROLLER_H
