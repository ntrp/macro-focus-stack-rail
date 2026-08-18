import { getBluetoothInstance, Peripheral } from '@nativescript-community/ble';
import { Observable } from '@nativescript/core';

const SERVICE_UUID = '7d2a0001-9b7e-4f31-a6d8-2c5f4e8b1000';
const COMMAND_UUID = '7d2a0002-9b7e-4f31-a6d8-2c5f4e8b1000';
const STATUS_UUID = '7d2a0003-9b7e-4f31-a6d8-2c5f4e8b1000';

type RailState = 'idle' | 'moving' | 'homing' | 'error';

interface RailStatus {
  state: RailState;
  pos_mm: number;
  homed: boolean;
  error: string;
}

export class RailViewModel extends Observable {
  private readonly bluetooth = getBluetoothInstance();
  private peripheralUUID: string | null = null;
  private receiveBuffer = '';

  connected = false;
  busy = false;
  controlsEnabled = false;
  connectionLabel = 'Not connected';
  detailLabel = 'Tap Connect to find FocusRail';
  connectButtonLabel = 'Connect';
  positionLabel = '— mm';
  stateLabel = 'State: unknown';
  homedLabel = 'Not homed';
  errorLabel = '';
  hasError = false;
  moveDistance = '1.0';
  jogDistance = '0.1';

  toggleConnection = async (): Promise<void> => {
    if (this.connected) {
      await this.disconnect();
    } else {
      await this.connect();
    }
  };

  home = async (): Promise<void> => this.sendCommand('HOME');
  stop = async (): Promise<void> => this.sendCommand('STOP');
  movePositive = async (): Promise<void> => this.sendDistance('MOVE', 1, this.moveDistance);
  moveNegative = async (): Promise<void> => this.sendDistance('MOVE', -1, this.moveDistance);
  jogPositive = async (): Promise<void> => this.sendDistance('JOG', 1, this.jogDistance);
  jogNegative = async (): Promise<void> => this.sendDistance('JOG', -1, this.jogDistance);

  private update(name: string, value: unknown): void {
    this.set(name, value);
  }

  private setBusy(value: boolean): void {
    this.busy = value;
    this.update('busy', value);
    this.controlsEnabled = this.connected && !value;
    this.update('controlsEnabled', this.controlsEnabled);
  }

  private async connect(): Promise<void> {
    this.setBusy(true);
    this.update('connectionLabel', 'Scanning…');
    this.update('detailLabel', 'Looking for FocusRail');
    this.clearError();

    try {
      if (!(await this.bluetooth.isBluetoothEnabled())) {
        throw new Error('Bluetooth is turned off');
      }

      let found: Peripheral | null = null;
      await this.bluetooth.startScanning({
        filters: [{ serviceUUID: SERVICE_UUID }],
        seconds: 8,
        avoidDuplicates: true,
        onDiscovered: (peripheral) => {
          if (!found) {
            found = peripheral;
            void this.bluetooth.stopScanning();
          }
        }
      });

      if (!found) throw new Error('FocusRail was not found');
      await this.connectPeripheral(found);
    } catch (error) {
      this.handleError(error);
      this.markDisconnected();
    } finally {
      this.setBusy(false);
    }
  }

  private async connectPeripheral(peripheral: Peripheral): Promise<void> {
    this.update('connectionLabel', 'Connecting…');
    this.update('detailLabel', peripheral.name || 'FocusRail');

    await this.bluetooth.connect({
      UUID: peripheral.UUID,
      serviceUUIDs: [SERVICE_UUID],
      autoDiscoverAll: true,
      autoMaxMTU: true,
      onDisconnected: () => this.markDisconnected()
    });

    this.peripheralUUID = peripheral.UUID;
    this.connected = true;
    this.update('connected', true);
    this.update('connectButtonLabel', 'Disconnect');
    this.update('connectionLabel', 'Connected');
    this.update('detailLabel', peripheral.name || 'FocusRail');

    // iOS chooses its own MTU. Android negotiates this value (or a lower one).
    try {
      await this.bluetooth.requestMtu({
        peripheralUUID: peripheral.UUID,
        value: 185
      });
    } catch {
      // Notification buffering below also handles smaller negotiated payloads.
    }

    await this.bluetooth.startNotifying({
      peripheralUUID: peripheral.UUID,
      serviceUUID: SERVICE_UUID,
      characteristicUUID: STATUS_UUID,
      onNotify: (result) => this.consumeStatusBytes(result.value)
    });

    this.setBusy(false);
    await this.sendCommand('STATUS?');
  }

  private async disconnect(): Promise<void> {
    const uuid = this.peripheralUUID;
    if (!uuid) {
      this.markDisconnected();
      return;
    }

    this.setBusy(true);
    try {
      await this.bluetooth.disconnect({ UUID: uuid });
    } catch (error) {
      this.handleError(error);
    } finally {
      this.markDisconnected();
      this.setBusy(false);
    }
  }

  private markDisconnected(): void {
    this.peripheralUUID = null;
    this.connected = false;
    this.controlsEnabled = false;
    this.update('connected', false);
    this.update('controlsEnabled', false);
    this.update('connectButtonLabel', 'Connect');
    this.update('connectionLabel', 'Not connected');
    this.update('detailLabel', 'Tap Connect to find FocusRail');
  }

  private async sendDistance(command: 'MOVE' | 'JOG', sign: 1 | -1, raw: string): Promise<void> {
    const distance = Number(raw.replace(',', '.'));
    if (!Number.isFinite(distance) || distance <= 0) {
      this.showError('Enter a positive distance');
      return;
    }
    if (distance > 50) {
      this.showError('One move cannot exceed 50 mm');
      return;
    }
    await this.sendCommand(`${command} ${(sign * distance).toFixed(4)}`);
  }

  private async sendCommand(command: string): Promise<void> {
    if (!this.peripheralUUID) {
      this.showError('Connect to the rail first');
      return;
    }

    try {
      await this.bluetooth.write({
        peripheralUUID: this.peripheralUUID,
        serviceUUID: SERVICE_UUID,
        characteristicUUID: COMMAND_UUID,
        value: `${command}\n`,
        encoding: 'UTF-8'
      });
    } catch (error) {
      this.handleError(error);
    }
  }

  private consumeStatusBytes(value: ArrayBuffer): void {
    const bytes = new Uint8Array(value);
    let chunk = '';
    for (const byte of bytes) chunk += String.fromCharCode(byte);
    this.receiveBuffer += chunk;

    let newline = this.receiveBuffer.indexOf('\n');
    while (newline >= 0) {
      const line = this.receiveBuffer.slice(0, newline).trim();
      this.receiveBuffer = this.receiveBuffer.slice(newline + 1);
      if (line) this.consumeStatusLine(line);
      newline = this.receiveBuffer.indexOf('\n');
    }
  }

  private consumeStatusLine(line: string): void {
    try {
      const status = JSON.parse(line) as RailStatus;
      this.update('positionLabel', `${status.pos_mm.toFixed(3)} mm`);
      this.update('stateLabel', `State: ${status.state}`);
      this.update('homedLabel', status.homed ? 'Homed' : 'Not homed');
      if (status.error) {
        this.showError(status.error.replace(/_/g, ' '));
      } else {
        this.clearError();
      }
    } catch {
      this.showError('Received an invalid status message');
    }
  }

  private clearError(): void {
    this.errorLabel = '';
    this.hasError = false;
    this.update('errorLabel', '');
    this.update('hasError', false);
  }

  private showError(message: string): void {
    this.errorLabel = message;
    this.hasError = true;
    this.update('errorLabel', message);
    this.update('hasError', true);
  }

  private handleError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.showError(message);
  }
}

