#include "../include/motion.h"

#include <AccelStepper.h>
#include <Arduino.h>
#include <TMCStepper.h>

#include <cmath>

#include "config.h"

using namespace RailConfig;

namespace Motion {
namespace {

enum class State { Idle, Moving, Homing, Error };
enum class HomePhase { None, Seeking, BackingOff };

HardwareSerial driverSerial(1);
TMC2209Stepper driver(&driverSerial, R_SENSE_OHMS, DRIVER_ADDRESS);
AccelStepper stepper(AccelStepper::DRIVER, STEP_PIN, DIR_PIN);

State state = State::Idle;
HomePhase homePhase = HomePhase::None;
bool homed = false;
String errorMessage;
long homeStartPosition = 0;
uint32_t homeStartMillis = 0;
bool dirty = true;

long mmToSteps(float mm) {
  return lroundf(mm * STEPS_PER_MM);
}

float stepsToMm(long steps) {
  return static_cast<float>(steps) / STEPS_PER_MM;
}

const char* stateName() {
  switch (state) {
    case State::Idle: return "idle";
    case State::Moving: return "moving";
    case State::Homing: return "homing";
    case State::Error: return "error";
  }
  return "error";
}

void restoreTravelProfile() {
  stepper.setMaxSpeed(mmToSteps(TRAVEL_SPEED_MM_S));
  stepper.setAcceleration(mmToSteps(ACCELERATION_MM_S2));
}

void setError(const String& message) {
  stepper.setCurrentPosition(stepper.currentPosition());
  state = State::Error;
  homePhase = HomePhase::None;
  errorMessage = message;
  dirty = true;
  Serial.printf("Error: %s\n", message.c_str());
}

}  // namespace

void setup() {
  pinMode(ENABLE_PIN, OUTPUT);
  pinMode(DIAG_PIN, INPUT_PULLDOWN);
  digitalWrite(ENABLE_PIN, HIGH);

  driverSerial.begin(115200, SERIAL_8N1, UART_RX_PIN, UART_TX_PIN);
  driver.begin();
  driver.pdn_disable(true);
  driver.mstep_reg_select(true);
  driver.I_scale_analog(false);
  driver.toff(4);
  driver.blank_time(24);
  driver.rms_current(MOTOR_CURRENT_MA_RMS, 0.5f);
  driver.microsteps(MICROSTEPS);
  driver.en_spreadCycle(true);  // StallGuard requires spreadCycle.
  driver.TCOOLTHRS(0xFFFFF);
  driver.SGTHRS(STALLGUARD_THRESHOLD);

  stepper.setPinsInverted(INVERT_DIRECTION, false, true);
  stepper.setEnablePin(ENABLE_PIN);
  stepper.setMinPulseWidth(2);
  restoreTravelProfile();
  stepper.enableOutputs();

  const uint8_t connectionResult = driver.test_connection();
  if (connectionResult == 0) {
    Serial.println("TMC UART OK");
  } else {
    Serial.printf("TMC UART error: %u\n", connectionResult);
    setError("tmc_uart");
  }
}

void startMove(float distanceMm) {
  if (!std::isfinite(distanceMm) || fabsf(distanceMm) < 0.0001f) {
    setError("invalid_distance");
    return;
  }
  if (fabsf(distanceMm) > MAX_SINGLE_MOVE_MM) {
    setError("move_too_large");
    return;
  }
  if (state == State::Moving || state == State::Homing) {
    setError("busy");
    return;
  }

  errorMessage = "";
  restoreTravelProfile();
  stepper.move(mmToSteps(distanceMm));
  state = State::Moving;
  dirty = true;
}

void startHoming() {
  if (state == State::Moving || state == State::Homing) {
    setError("busy");
    return;
  }

  errorMessage = "";
  homed = false;
  state = State::Homing;
  homePhase = HomePhase::Seeking;
  homeStartPosition = stepper.currentPosition();
  homeStartMillis = millis();

  stepper.setMaxSpeed(mmToSteps(HOME_SPEED_MM_S));
  stepper.setAcceleration(mmToSteps(ACCELERATION_MM_S2));
  stepper.moveTo(homeStartPosition +
                 HOME_DIRECTION * mmToSteps(HOME_MAX_TRAVEL_MM));
  dirty = true;
}

void requestStop() {
  if (state == State::Moving || state == State::Homing) {
    stepper.stop();
    homed = false;
    homePhase = HomePhase::None;
    state = State::Moving;  // Wait for the deceleration to finish.
    errorMessage = "stopped";
    dirty = true;
  }
}

void zeroPosition() {
  if (state == State::Idle || state == State::Error) {
    stepper.setCurrentPosition(0);
    homed = false;
    state = State::Idle;
    errorMessage = "";
    dirty = true;
  } else {
    setError("busy");
  }
}

void reject(const char* error) {
  setError(error);
}

void update() {
  stepper.run();

  if (state == State::Moving && stepper.distanceToGo() == 0) {
    state = State::Idle;
    if (errorMessage == "stopped") errorMessage = "";
    dirty = true;
    return;
  }

  if (state != State::Homing) return;

  if (homePhase == HomePhase::Seeking) {
    const long distance = labs(stepper.currentPosition() - homeStartPosition);
    const bool ignoreWindowPassed =
        distance >= mmToSteps(HOME_STALL_IGNORE_MM) &&
        millis() - homeStartMillis >= HOME_STALL_IGNORE_MS;

    if (ignoreWindowPassed && digitalRead(DIAG_PIN) == HIGH) {
      stepper.setCurrentPosition(stepper.currentPosition());
      stepper.setMaxSpeed(mmToSteps(HOME_SPEED_MM_S));
      stepper.move(HOME_DIRECTION * -mmToSteps(HOME_BACKOFF_MM));
      homePhase = HomePhase::BackingOff;
      dirty = true;
    } else if (millis() - homeStartMillis > HOME_TIMEOUT_MS ||
               stepper.distanceToGo() == 0) {
      setError("home_not_found");
    }
  } else if (homePhase == HomePhase::BackingOff &&
             stepper.distanceToGo() == 0) {
    stepper.setCurrentPosition(0);
    restoreTravelProfile();
    homed = true;
    homePhase = HomePhase::None;
    state = State::Idle;
    errorMessage = "";
    dirty = true;
  }
}

String statusJson() {
  String json = "{\"state\":\"";
  json += stateName();
  json += "\",\"pos_mm\":";
  json += String(stepsToMm(stepper.currentPosition()), 3);
  json += ",\"homed\":";
  json += homed ? "true" : "false";
  json += ",\"error\":\"";
  json += errorMessage;
  json += "\"}\n";
  return json;
}

bool statusDirty() {
  return dirty;
}

void markStatusPublished() {
  dirty = false;
}

void markStatusDirty() {
  dirty = true;
}

}  // namespace Motion
