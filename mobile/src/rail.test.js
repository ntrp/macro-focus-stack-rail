import assert from "node:assert/strict";
import test from "node:test";
import { parseCoordinate, parseSpeed, parseStatus } from "./rail.js";

test("validates G-code inputs and status messages", () => {
  assert.equal(parseCoordinate("-0,125"), -0.125);
  assert.throws(() => parseCoordinate(""), /valid position/);
  assert.equal(parseSpeed("120"), 120);
  assert.throws(() => parseSpeed("0"), /between 0 and 300/);
  assert.throws(() => parseSpeed("301"), /between 0 and 300/);
  assert.deepEqual(
    parseStatus('{"state":"idle","pos_mm":1.25,"homed":true,"error":""}'),
    {
      state: "idle",
      pos_mm: 1.25,
      homed: true,
      error: "",
    },
  );
  assert.throws(() => parseStatus('{"state":"idle"}'), /invalid status/);
});
