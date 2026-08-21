import {
  checkPermissions,
  connect,
  disconnect,
  getAdapterState,
  sendString,
  startScan,
  stopScan,
  subscribeString,
  unsubscribe,
} from "@mnlphlp/plugin-blec";
import { parseCoordinate, parseSpeed, parseStatus } from "./rail.js";
import "./style.css";

const SERVICE_UUID = "7d2a0001-9b7e-4f31-a6d8-2c5f4e8b1000";
const COMMAND_UUID = "7d2a0002-9b7e-4f31-a6d8-2c5f4e8b1000";
const STATUS_UUID = "7d2a0003-9b7e-4f31-a6d8-2c5f4e8b1000";
const $ = (id) => document.getElementById(id);

const ui = {
  connect: $("connect-button"),
  home: $("home-button"),
  zero: $("zero-button"),
  stop: $("stop-button"),
  incrementButtons: [...document.querySelectorAll(".step-button")],
  moveSpeed: $("move-speed"),
  absolutePosition: $("absolute-position"),
  absoluteMove: $("absolute-move"),
  connection: $("connection-label"),
  detail: $("detail-label"),
  position: $("position-label"),
  railState: $("state-label"),
  homed: $("homed-label"),
  error: $("error-label"),
};

const app = {
  connected: false,
  busy: false,
  deviceName: "",
  error: "",
  receiveBuffer: "",
  railState: "unknown",
};

function render() {
  ui.connect.textContent = app.connected ? "Disconnect" : "Connect";
  ui.connect.disabled = app.busy;
  ui.connection.textContent = app.busy
    ? app.connected
      ? "Disconnecting…"
      : "Scanning…"
    : app.connected
      ? "Connected"
      : "Not connected";
  ui.detail.textContent = app.connected
    ? app.deviceName
    : app.busy
      ? "Looking for FocusRail"
      : "Tap Connect to find FocusRail";

  const unavailable = !app.connected || app.busy;
  const motionActive = app.railState === "moving" || app.railState === "homing";
  const motionDisabled = unavailable || motionActive;
  for (const control of [
    ui.home,
    ui.zero,
    ui.absoluteMove,
    ...ui.incrementButtons,
  ]) {
    control.disabled = motionDisabled;
  }
  ui.stop.disabled = unavailable;
  ui.moveSpeed.disabled = motionDisabled;
  ui.absolutePosition.disabled = motionDisabled;

  ui.error.textContent = app.error;
  ui.error.hidden = !app.error;
}

function showError(error) {
  app.error = error instanceof Error ? error.message : String(error);
  render();
}

function markDisconnected() {
  app.connected = false;
  app.busy = false;
  app.deviceName = "";
  app.receiveBuffer = "";
  app.railState = "unknown";
  render();
}

async function requestBluetoothPermission() {
  try {
    if (!(await checkPermissions(true)))
      throw new Error("Bluetooth permission is required");
    await getAdapterState(); // Triggers the native Apple permission prompt.
  } catch (error) {
    showError(error);
  }
}

async function findRail() {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void stopScan()
        .catch(() => {})
        .finally(() => callback(value));
    };
    const timer = setTimeout(
      () => finish(reject, new Error("FocusRail was not found")),
      8000,
    );

    startScan((devices) => {
      const rail = devices.find(
        (device) =>
          device.name === "FocusRail" ||
          device.services.some((uuid) => uuid.toLowerCase() === SERVICE_UUID),
      );
      if (rail) finish(resolve, rail);
    }, 8000).catch((error) => finish(reject, error));
  });
}

async function connectRail() {
  app.busy = true;
  app.error = "";
  render();

  try {
    if (!(await checkPermissions(true)))
      throw new Error("Bluetooth permission is required");
    if ((await getAdapterState()) !== "On")
      throw new Error("Bluetooth is turned off");

    const rail = await findRail();
    await connect(rail.address, markDisconnected);
    await subscribeString(STATUS_UUID, SERVICE_UUID, consumeStatusChunk);

    app.connected = true;
    app.deviceName = rail.name || "FocusRail";
    app.busy = false;
    render();
    await sendCommand("M114");
  } catch (error) {
    markDisconnected();
    showError(error);
  }
}

async function disconnectRail() {
  app.busy = true;
  app.error = "";
  render();
  try {
    await unsubscribe(STATUS_UUID, SERVICE_UUID).catch(() => {});
    await disconnect();
  } catch (error) {
    showError(error);
  } finally {
    markDisconnected();
  }
}

async function sendCommand(command) {
  if (!app.connected) {
    showError(new Error("Connect to the rail first"));
    return false;
  }
  try {
    app.error = "";
    render();
    await sendString(
      COMMAND_UUID,
      `${command}\n`,
      "withResponse",
      SERVICE_UUID,
    );
    return true;
  } catch (error) {
    showError(error);
    return false;
  }
}

async function sendMove(mode, rawCoordinate) {
  try {
    const coordinate = parseCoordinate(rawCoordinate);
    const speed = parseSpeed(ui.moveSpeed.value);
    if (
      await sendCommand(
        `${mode} G0 X${coordinate.toFixed(4)} F${speed.toFixed(2)}`,
      )
    ) {
      app.railState = "moving";
      render();
    }
  } catch (error) {
    showError(error);
  }
}

function consumeStatusChunk(chunk) {
  app.receiveBuffer += chunk;
  let newline = app.receiveBuffer.indexOf("\n");
  while (newline >= 0) {
    const line = app.receiveBuffer.slice(0, newline).trim();
    app.receiveBuffer = app.receiveBuffer.slice(newline + 1);
    if (line) consumeStatusLine(line);
    newline = app.receiveBuffer.indexOf("\n");
  }
}

function consumeStatusLine(line) {
  try {
    const status = parseStatus(line);
    ui.position.textContent = `${status.pos_mm.toFixed(3)} mm`;
    ui.railState.textContent = `State: ${status.state}`;
    app.railState = status.state;
    ui.homed.textContent = status.homed ? "Homed" : "Not homed";
    app.error = status.error ? status.error.replaceAll("_", " ") : "";
    render();
  } catch (error) {
    showError(error);
  }
}

ui.connect.addEventListener("click", () =>
  app.connected ? disconnectRail() : connectRail(),
);
ui.home.addEventListener("click", async () => {
  if (await sendCommand("G28")) {
    app.railState = "homing";
    render();
  }
});
ui.zero.addEventListener("click", () => sendCommand("G92 X0"));
ui.stop.addEventListener("click", () => sendCommand("M0"));
for (const button of ui.incrementButtons) {
  button.addEventListener("click", () => sendMove("G91", button.dataset.step));
}
ui.absoluteMove.addEventListener("click", () =>
  sendMove("G90", ui.absolutePosition.value),
);

render();
void requestBluetoothPermission();
