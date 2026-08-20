const STATES = new Set(['idle', 'moving', 'homing', 'error']);

export function parseDistance(raw) {
  const distance = Number(String(raw).trim().replace(',', '.'));
  if (!Number.isFinite(distance) || distance <= 0) throw new Error('Enter a positive distance');
  if (distance > 50) throw new Error('One move cannot exceed 50 mm');
  return distance;
}

export function parseStatus(line) {
  const status = JSON.parse(line);
  if (!status || !STATES.has(status.state) || !Number.isFinite(status.pos_mm) ||
      typeof status.homed !== 'boolean' || typeof status.error !== 'string') {
    throw new Error('Received an invalid status message');
  }
  return status;
}
