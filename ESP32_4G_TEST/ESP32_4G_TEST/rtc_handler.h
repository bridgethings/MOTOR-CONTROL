/*
 * rtc_handler.h - PCF85063 RTC Driver
 *
 * Manages the PCF85063TP real-time clock on I2C bus.
 * Provides time get/set and Unix timestamp helpers.
 */

#ifndef RTC_HANDLER_H
#define RTC_HANDLER_H

#include <Arduino.h>

// Initialize I2C and RTC. Returns true if RTC detected.
bool rtc_init();

// Get current time from RTC
bool rtc_get_time(int &year, int &month, int &day, int &hour, int &minute, int &second);

// Set RTC time
bool rtc_set_time(int year, int month, int day, int hour, int minute, int second);

// Get Unix timestamp (seconds since epoch). Returns 0 if RTC not available.
unsigned long rtc_get_timestamp();

// Get formatted time string "YYYY-MM-DD HH:MM:SS"
String rtc_get_datetime_string();

// Check if RTC has a valid time set (year >= 2024)
bool rtc_is_valid();

// Check if RTC was detected during init
bool rtc_is_available();

#endif // RTC_HANDLER_H
