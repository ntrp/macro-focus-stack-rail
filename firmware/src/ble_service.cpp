#include "../include/ble_service.h"

#include <Arduino.h>
#include <BLE2902.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>

#include <cstring>
#include <string>

#include "../include/config.h"
#include "../include/motion.h"

using namespace RailConfig;

namespace BleService {
namespace {

struct CommandMessage {
  char text[64];
};

BLECharacteristic* statusCharacteristic = nullptr;
QueueHandle_t commandQueue = nullptr;
volatile bool connected = false;
uint32_t lastStatusMillis = 0;

class ServerCallbacks final : public BLEServerCallbacks {
  void onConnect(BLEServer*) override {
    connected = true;
    Motion::markStatusDirty();
  }

  void onDisconnect(BLEServer* server) override {
    connected = false;
    server->getAdvertising()->start();
  }
};

class CommandCallbacks final : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* characteristic) override {
    const std::string value = characteristic->getValue();
    if (value.empty() || commandQueue == nullptr) return;

    CommandMessage message{};
    const size_t count = min(value.size(), sizeof(message.text) - 1);
    memcpy(message.text, value.data(), count);
    message.text[count] = '\0';
    xQueueSend(commandQueue, &message, 0);
  }
};

}  // namespace

void setup() {
  commandQueue = xQueueCreate(6, sizeof(CommandMessage));

  BLEDevice::init(BLE_DEVICE_NAME);
  BLEDevice::setMTU(185);

  BLEServer* server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());
  BLEService* service = server->createService(BLE_SERVICE_UUID);

  BLECharacteristic* commandCharacteristic = service->createCharacteristic(
      BLE_COMMAND_UUID,
      BLECharacteristic::PROPERTY_WRITE |
          BLECharacteristic::PROPERTY_WRITE_NR);
  commandCharacteristic->setCallbacks(new CommandCallbacks());

  statusCharacteristic = service->createCharacteristic(
      BLE_STATUS_UUID,
      BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  statusCharacteristic->addDescriptor(new BLE2902());
  const String initialStatus = Motion::statusJson();
  statusCharacteristic->setValue(
      std::string(initialStatus.c_str(), initialStatus.length()));

  service->start();
  BLEAdvertising* advertising = server->getAdvertising();
  advertising->addServiceUUID(BLE_SERVICE_UUID);
  advertising->setScanResponse(true);
  advertising->start();
  Serial.println("BLE advertising as FocusRail");
}

bool receiveCommand(String& command) {
  CommandMessage message{};
  if (xQueueReceive(commandQueue, &message, 0) != pdTRUE) return false;
  command = message.text;
  return true;
}

void publishStatus(bool force) {
  const uint32_t now = millis();
  if (!force && !Motion::statusDirty() && now - lastStatusMillis < 250) return;

  lastStatusMillis = now;
  Motion::markStatusPublished();
  const String json = Motion::statusJson();
  Serial.print(json);

  if (connected && statusCharacteristic != nullptr) {
    statusCharacteristic->setValue(std::string(json.c_str(), json.length()));
    statusCharacteristic->notify();
  }
}

}  // namespace BleService
