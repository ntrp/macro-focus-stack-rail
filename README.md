# BLE Focus Rail — first iteration

This repository contains:

- `firmware/`: PlatformIO firmware for a Seeed Studio XIAO ESP32-C3 and TMC2209.
- `mobile/`: a NativeScript Core/TypeScript app for Android and iOS.

The firmware drives the rail through STEP/DIR, configures and checks the TMC2209 over UART, homes against a mechanical end using StallGuard/DIAG, and exposes a small text protocol over BLE. The app discovers the rail, connects, subscribes to status updates, and provides home, relative move, jog, and stop controls.

> Sensorless homing must be tuned on the assembled rail. Start with the carriage near the stop, keep a hand on power, and be ready to disconnect the motor supply. Never test the first homing run with a camera mounted.

## Wiring and pin assignments

The pin names below are the XIAO board's silkscreen names; the GPIO numbers are what the firmware uses.

| XIAO ESP32-C3 | GPIO | TMC2209 carrier         | Notes                                           |
| ------------- | ---: | ----------------------- | ----------------------------------------------- |
| D0            |    2 | STEP                    | Step input                                      |
| D1            |    3 | DIR                     | Direction input                                 |
| D2            |    4 | EN                      | Active-low enable                               |
| D3            |    5 | DIAG                    | StallGuard output; firmware expects active-high |
| D6 / TX       |   21 | PDN_UART through 1 kOhm | UART transmit                                   |
| D7 / RX       |   20 | PDN_UART directly       | UART receive                                    |
| 3V3           |    — | VIO                     | Logic supply; confirm your carrier exposes VIO  |
| GND           |    — | GND                     | Logic and motor-supply grounds must be common   |

For the TMC2209's one-wire UART, join RX directly to `PDN_UART` and TX through a **1 kOhm resistor** to that same node. Set both address straps (`MS1` and `MS2`) low so the UART address is `0b00`, matching the firmware.

Connect the motor supply to `VM/GND`, not to the XIAO. For the earlier 12 V boost-supply design, place a **220–470 uF, 25 V electrolytic** close to `VM/GND` (plus the carrier's normal ceramic decoupling). Never connect or disconnect a stepper motor while powered.

Carrier boards differ. Confirm its pinout, sense-resistor value, UART solder jumpers, and DIAG behavior before powering it. The firmware assumes `R_SENSE = 0.11 ohm`, which is common but not universal.

## Conservative mechanical defaults

The defaults are in `firmware/include/config.h`:

- 1.0 mm lead screw
- 1.8 degree motor (200 full steps/revolution)
- 1/16 microstepping
- 3,200 microsteps/mm
- 400 mA RMS motor current (about 566 mA sine-wave peak)
- 2 mm/s normal speed; 2 mm/s^2 acceleration
- 1 mm/s homing speed
- 100 mm maximum homing search
- 1 mm backoff from the physical stop
- StallGuard threshold 80

`HOME_DIRECTION = -1` means homing moves in the negative coordinate direction. Change it to `1` if your mechanics run the other way. If motor direction is reversed, change `INVERT_DIRECTION` rather than swapping live motor wires.

## Firmware build and upload

1. Install [Visual Studio Code](https://code.visualstudio.com/) and the PlatformIO extension, or install PlatformIO Core.
2. Open the `firmware` directory as the PlatformIO project.
3. Connect the XIAO ESP32-C3 by USB.
4. Build and upload:

   ```sh
   cd firmware
   pio run
   pio run --target upload
   pio device monitor
   ```

The serial monitor runs at 115200 baud. At boot, `TMC UART OK` should appear. If it reports a UART error, do not attempt homing: check the common ground, one-wire UART resistor/wiring, driver address straps, and `R_SENSE`.

The motor is deliberately left energized while idle so the reported open-loop position is not immediately lost. `STOP` decelerates using the configured acceleration; it is not a safety-rated emergency stop. Remove motor power for an actual emergency.

## Mobile app build

Prerequisites are Node.js and the normal Android Studio/Xcode setup for the target platform. Install the NativeScript CLI globally with npm, then verify the installation:

```sh
npm install -g nativescript
ns --version
```

Install and run the app:

```sh
cd mobile
npm install
ns doctor
ns run android
```

On macOS, use `ns run ios` for iOS. BLE requires a physical phone; the standard Android emulator and iOS Simulator are not suitable for testing this rail.

The first connection may trigger Bluetooth/location permission prompts. Android 12+ uses the nearby-devices permissions; older Android versions can require location permission for BLE discovery. iOS displays the usage text in `Info.plist`.

## BLE protocol

Device name: `FocusRail`

| Item                                | UUID                                   |
| ----------------------------------- | -------------------------------------- |
| Service                             | `7d2a0001-9b7e-4f31-a6d8-2c5f4e8b1000` |
| Command characteristic (write)      | `7d2a0002-9b7e-4f31-a6d8-2c5f4e8b1000` |
| Status characteristic (read/notify) | `7d2a0003-9b7e-4f31-a6d8-2c5f4e8b1000` |

Commands are UTF-8 text terminated by a newline:

| Command      | Meaning                                                           |
| ------------ | ----------------------------------------------------------------- |
| `HOME`       | Seek the configured end stop, then back off and set position to 0 |
| `MOVE 1.250` | Move 1.250 mm relative to the current position                    |
| `JOG -0.100` | Same relative movement command, intended for manual jogging       |
| `STOP`       | Decelerate to a stop                                              |
| `ZERO`       | Set the current position to 0 while idle                          |
| `STATUS?`    | Request an immediate status notification                          |

Status is newline-terminated JSON. Example:

```json
{ "state": "idle", "pos_mm": 1.25, "homed": true, "error": "" }
```

Possible states are `idle`, `moving`, `homing`, and `error`. Commands that cannot be accepted produce an `error` status. A new valid motion or home command clears a prior command error.

The app requests a 185-byte MTU and also buffers notification fragments before parsing a newline, so the status message works on both platforms.

## First hardware checkout and StallGuard tuning

1. Power only the XIAO and confirm the firmware advertises as `FocusRail`.
2. Power the driver with the motor disconnected only while power is off; then power up and confirm `TMC UART OK`.
3. Use very small 0.05–0.10 mm jogs to confirm direction and smooth movement.
4. Put the carriage 2–3 mm from the homing stop, remove the camera, and tap Home.
5. If it stops before touching, reduce `STALLGUARD_THRESHOLD`. If it pushes hard or reaches the search limit, increase the threshold in small steps and verify DIAG wiring.
6. Repeat from progressively farther away. Sensorless homing behavior changes with speed, current, lubrication, screw preload, and temperature, so test the full mechanical range.

This first iteration is open-loop: position is measured from commanded microsteps, not an encoder. A skipped step, manual movement while unpowered, or a motor stall invalidates position; home again after any of those events.
