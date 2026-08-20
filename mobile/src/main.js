import {
  checkPermissions,
  connect,
  disconnect,
  getAdapterState,
  sendString,
  startScan,
  stopScan,
  subscribeString,
  unsubscribe
} from '@mnlphlp/plugin-blec';
import { parseDistance, parseStatus } from './rail.js';
import './style.css';

const SERVICE_UUID = '7d2a0001-9b7e-4f31-a6d8-2c5f4e8b1000';
const COMMAND_UUID = '7d2a0002-9b7e-4f31-a6d8-2c5f4e8b1000';
const STATUS_UUID = '7d2a0003-9b7e-4f31-a6d8-2c5f4e8b1000';
const $ = (id) => document.getElementById(id);

const ui = {
  connect: $('connect-button'),
  home: $('home-button'),
  stop: $('stop-button'),
  moveNegative: $('move-negative'),
  movePositive: $('move-positive'),
  jogNegative: $('jog-negative'),
  jogPositive: $('jog-positive'),
  moveDistance: $('move-distance'),
  jogDistance: $('jog-distance'),
  connection: $('connection-label'),
  detail: $('detail-label'),
  position: $('position-label'),
  railState: $('state-label'),
  homed: $('homed-label'),
  error: $('error-label')
};

const app = {
  connected: false,
  busy: false,
  deviceName: '',
  error: '',
  receiveBuffer: ''
};

function render() {
  ui.connect.textContent = app.connected ? 'Disconnect' : 'Connect';
  ui.connect.disabled = app.busy;
  ui.connection.textContent = app.busy ? (app.connected ? 'Disconnecting…' : 'Scanning…') :
    (app.connected ? 'Connected' : 'Not connected');
  ui.detail.textContent = app.connected ? app.deviceName :
    (app.busy ? 'Looking for FocusRail' : 'Tap Connect to find FocusRail');

  const controlsDisabled = !app.connected || app.busy;
  for (const control of [ui.home, ui.stop, ui.moveNegative, ui.movePositive, ui.jogNegative, ui.jogPositive]) {
    control.disabled = controlsDisabled;
  }

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
  app.deviceName = '';
  app.receiveBuffer = '';
  render();
}

async function requestBluetoothPermission() {
  try {
    if (!await checkPermissions(true)) throw new Error('Bluetooth permission is required');
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
      void stopScan().catch(() => {}).finally(() => callback(value));
    };
    const timer = setTimeout(() => finish(reject, new Error('FocusRail was not found')), 8000);

    startScan((devices) => {
      const rail = devices.find((device) =>
        device.name === 'FocusRail' || device.services.some((uuid) => uuid.toLowerCase() === SERVICE_UUID)
      );
      if (rail) finish(resolve, rail);
    }, 8000).catch((error) => finish(reject, error));
  });
}

async function connectRail() {
  app.busy = true;
  app.error = '';
  render();

  try {
    if (!await checkPermissions(true)) throw new Error('Bluetooth permission is required');
    if (await getAdapterState() !== 'On') throw new Error('Bluetooth is turned off');

    const rail = await findRail();
    await connect(rail.address, markDisconnected);
    await subscribeString(STATUS_UUID, SERVICE_UUID, consumeStatusChunk);

    app.connected = true;
    app.deviceName = rail.name || 'FocusRail';
    app.busy = false;
    render();
    await sendCommand('STATUS?');
  } catch (error) {
    markDisconnected();
    showError(error);
  }
}

async function disconnectRail() {
  app.busy = true;
  app.error = '';
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
    showError(new Error('Connect to the rail first'));
    return;
  }
  try {
    app.error = '';
    render();
    await sendString(COMMAND_UUID, `${command}\n`, 'withResponse', SERVICE_UUID);
  } catch (error) {
    showError(error);
  }
}

async function sendDistance(command, sign, input) {
  try {
    const distance = parseDistance(input.value);
    await sendCommand(`${command} ${(sign * distance).toFixed(4)}`);
  } catch (error) {
    showError(error);
  }
}

function consumeStatusChunk(chunk) {
  app.receiveBuffer += chunk;
  let newline = app.receiveBuffer.indexOf('\n');
  while (newline >= 0) {
    const line = app.receiveBuffer.slice(0, newline).trim();
    app.receiveBuffer = app.receiveBuffer.slice(newline + 1);
    if (line) consumeStatusLine(line);
    newline = app.receiveBuffer.indexOf('\n');
  }
}

function consumeStatusLine(line) {
  try {
    const status = parseStatus(line);
    ui.position.textContent = `${status.pos_mm.toFixed(3)} mm`;
    ui.railState.textContent = `State: ${status.state}`;
    ui.homed.textContent = status.homed ? 'Homed' : 'Not homed';
    app.error = status.error ? status.error.replaceAll('_', ' ') : '';
    render();
  } catch (error) {
    showError(error);
  }
}

ui.connect.addEventListener('click', () => app.connected ? disconnectRail() : connectRail());
ui.home.addEventListener('click', () => sendCommand('HOME'));
ui.stop.addEventListener('click', () => sendCommand('STOP'));
ui.moveNegative.addEventListener('click', () => sendDistance('MOVE', -1, ui.moveDistance));
ui.movePositive.addEventListener('click', () => sendDistance('MOVE', 1, ui.moveDistance));
ui.jogNegative.addEventListener('click', () => sendDistance('JOG', -1, ui.jogDistance));
ui.jogPositive.addEventListener('click', () => sendDistance('JOG', 1, ui.jogDistance));

render();
void requestBluetoothPermission();
