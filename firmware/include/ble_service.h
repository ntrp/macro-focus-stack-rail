#pragma once

class String;

namespace BleService {

void setup();
bool receiveCommand(String& command);
bool waitForCommand(String& command);
void publishStatus(bool force = false);

}  // namespace BleService
