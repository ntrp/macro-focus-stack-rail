const STATES = new Set(["idle", "moving", "homing", "error"]);

export function parseCoordinate(raw) {
  const normalized = String(raw).trim().replace(",", ".");
  if (!normalized) throw new Error("Enter a valid position");
  const coordinate = Number(normalized);
  if (!Number.isFinite(coordinate)) throw new Error("Enter a valid position");
  return coordinate;
}

export function parseSpeed(raw) {
  const speed = parseCoordinate(raw);
  if (speed <= 0 || speed > 300)
    throw new Error("Speed must be between 0 and 300 mm/min");
  return speed;
}

export function parseStatus(line) {
  let status;
  try {
    status = JSON.parse(line);
  } catch {
    throw new Error("Received an invalid status message");
  }
  if (
    !status ||
    !STATES.has(status.state) ||
    !Number.isFinite(status.pos_mm) ||
    typeof status.homed !== "boolean" ||
    typeof status.error !== "string"
  ) {
    throw new Error("Received an invalid status message");
  }
  return status;
}
