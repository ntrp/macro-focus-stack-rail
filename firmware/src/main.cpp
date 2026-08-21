#include <Arduino.h>

#include "../include/ble_service.h"
#include "../include/commands.h"
#include "../include/motion.h"

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\nFocusRail starting");

  Motion::setup();
  BleService::setup();
  BleService::publishStatus(true);
}

void loop() {
  String command;

  if (Motion::isActive()) {
    while (BleService::receiveCommand(command)) {
      if (Commands::process(command)) BleService::publishStatus(true);
    }
    Motion::update();
    delay(0);
  } else if (BleService::waitForCommand(command)) {
    if (Commands::process(command)) BleService::publishStatus(true);
  }

  BleService::publishStatus();
}
