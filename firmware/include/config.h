#pragma once

#include <Arduino.h>

namespace RailConfig {

// XIAO ESP32-C3 silkscreen: D0, D1, D2, D3, D6/TX, D7/RX.
constexpr uint8_t STEP_PIN = 2;
constexpr uint8_t DIR_PIN = 3;
constexpr uint8_t ENABLE_PIN = 4;
constexpr uint8_t DIAG_PIN = 5;
constexpr uint8_t UART_TX_PIN = 21;
constexpr uint8_t UART_RX_PIN = 20;

constexpr float R_SENSE_OHMS = 0.11f;  // Verify against the carrier.
constexpr uint8_t DRIVER_ADDRESS = 0b00;
constexpr uint16_t MOTOR_CURRENT_MA_RMS = 500;
constexpr uint16_t MICROSTEPS = 4;

constexpr float LEAD_SCREW_MM_PER_REV = 1.0f;
constexpr uint16_t MOTOR_FULL_STEPS_PER_REV = 200;  // 1.8-degree motor.
constexpr float STEPS_PER_MM =
    (MOTOR_FULL_STEPS_PER_REV * MICROSTEPS) / LEAD_SCREW_MM_PER_REV;

constexpr bool INVERT_DIRECTION = false;
constexpr int8_t HOME_DIRECTION = -1;  // Must be -1 or +1.
constexpr float TRAVEL_SPEED_MM_S = 5.0f;
constexpr float ACCELERATION_MM_S2 = 2.0f;
constexpr float HOME_SPEED_MM_S = 1.0f;
constexpr float HOME_BACKOFF_MM = 1.0f;
constexpr float HOME_MAX_TRAVEL_MM = 100.0f;
constexpr uint32_t HOME_TIMEOUT_MS = 120000;
constexpr float HOME_STALL_IGNORE_MM = 0.5f;
constexpr uint32_t HOME_STALL_IGNORE_MS = 300;

// TMC2209 SGTHRS: higher values are more sensitive. Tune on the real rail.
constexpr uint8_t STALLGUARD_THRESHOLD = 80;
// UART fallback for carriers whose DIAG output does not assert.
constexpr uint16_t STALLGUARD_UART_THRESHOLD = 60;
constexpr uint8_t STALLGUARD_UART_SAMPLES = 3;
constexpr uint32_t STALLGUARD_SAMPLE_INTERVAL_MS = 20;
constexpr float MAX_SINGLE_MOVE_MM = 50.0f;

constexpr char BLE_DEVICE_NAME[] = "FocusRail";
// BLE interval units are 0.625 ms; 0x0800 is the ESP-IDF 1.28 s default.
constexpr uint16_t BLE_ADVERTISING_INTERVAL_UNITS = 0x0800;
constexpr char BLE_SERVICE_UUID[] = "7d2a0001-9b7e-4f31-a6d8-2c5f4e8b1000";
constexpr char BLE_COMMAND_UUID[] = "7d2a0002-9b7e-4f31-a6d8-2c5f4e8b1000";
constexpr char BLE_STATUS_UUID[] = "7d2a0003-9b7e-4f31-a6d8-2c5f4e8b1000";

static_assert(HOME_DIRECTION == -1 || HOME_DIRECTION == 1,
              "HOME_DIRECTION must be -1 or +1");
static_assert(STALLGUARD_UART_THRESHOLD <= 1023,
              "STALLGUARD_UART_THRESHOLD must fit SG_RESULT");
static_assert(STALLGUARD_UART_SAMPLES > 0,
              "STALLGUARD_UART_SAMPLES must be positive");

}  // namespace RailConfig

