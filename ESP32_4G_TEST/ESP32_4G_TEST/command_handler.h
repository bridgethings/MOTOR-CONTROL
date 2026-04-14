/*
 * command_handler.h - Unified Command Dispatcher
 *
 * Processes JSON commands from BLE and MQTT sources.
 * Routes responses back to the originating source.
 */

#ifndef COMMAND_HANDLER_H
#define COMMAND_HANDLER_H

#include <Arduino.h>
#include "ble_handler.h"

// Process a JSON command string and send response via the appropriate channel
void processConfigCommand(const String& command, CommandSource source);

// Send response to the command source
void sendCommandResponse(const String& response, CommandSource source);

#endif // COMMAND_HANDLER_H
