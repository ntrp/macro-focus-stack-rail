#include "../include/commands.h"

#include <Arduino.h>
#include <cstdio>

#include "../include/motion.h"

namespace Commands {
namespace {

bool absoluteMode = true;

bool parseMove(const String& command, float& coordinateMm, float& speedMmMin) {
  int consumed = 0;
  const int matched = sscanf(command.c_str() + 2, " X%f F%f%n", &coordinateMm,
                             &speedMmMin, &consumed);
  return matched == 2 && consumed == command.length() - 2;
}

bool parseSetPosition(const String& command, float& positionMm) {
  int consumed = 0;
  const int matched =
      sscanf(command.c_str(), "G92 X%f%n", &positionMm, &consumed);
  return matched == 1 && consumed == command.length();
}

void processMove(const String& command, bool absolute) {
  float coordinateMm = 0.0f;
  float speedMmMin = 0.0f;
  if (!parseMove(command, coordinateMm, speedMmMin)) {
    Motion::reject("invalid_gcode");
  } else {
    Motion::startMove(coordinateMm, speedMmMin / 60.0f, absolute);
  }
}

}  // namespace

bool process(String command) {
  command.trim();
  command.toUpperCase();
  Serial.printf("Command: %s\n", command.c_str());

  if (command == "G90") {
    absoluteMode = true;
  } else if (command == "G91") {
    absoluteMode = false;
  } else if (command.startsWith("G90 G0 ") ||
             command.startsWith("G90 G1 ")) {
    absoluteMode = true;
    processMove(command.substring(4), true);
  } else if (command.startsWith("G91 G0 ") ||
             command.startsWith("G91 G1 ")) {
    absoluteMode = false;
    processMove(command.substring(4), false);
  } else if (command.startsWith("G0 ") || command.startsWith("G1 ")) {
    processMove(command, absoluteMode);
  } else if (command.startsWith("G92 ")) {
    float positionMm = 0.0f;
    if (!parseSetPosition(command, positionMm)) {
      Motion::reject("invalid_gcode");
    } else {
      Motion::setPosition(positionMm);
    }
  } else if (command == "G28") {
    Motion::startHoming();
  } else if (command == "M0") {
    Motion::requestStop();
  } else if (command == "M114") {
    return true;
  } else {
    Motion::reject("unknown_command");
  }

  return false;
}

}  // namespace Commands
