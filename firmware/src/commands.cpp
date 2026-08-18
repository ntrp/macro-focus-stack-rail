#include "../include/commands.h"

#include <Arduino.h>
#include <cstdlib>

#include "../include/motion.h"

namespace Commands {

bool process(String command) {
  command.trim();
  command.toUpperCase();
  Serial.printf("Command: %s\n", command.c_str());

  if (command == "HOME") {
    Motion::startHoming();
  } else if (command == "STOP") {
    Motion::requestStop();
  } else if (command == "ZERO") {
    Motion::zeroPosition();
  } else if (command == "STATUS?") {
    return true;
  } else if (command.startsWith("MOVE ") || command.startsWith("JOG ")) {
    const int separator = command.indexOf(' ');
    const String argument = command.substring(separator + 1);
    char* end = nullptr;
    const float mm = strtof(argument.c_str(), &end);
    if (end == argument.c_str() || *end != '\0') {
      Motion::reject("invalid_distance");
    } else {
      Motion::startMove(mm);
    }
  } else {
    Motion::reject("unknown_command");
  }

  return false;
}

}  // namespace Commands
