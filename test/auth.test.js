const test = require("node:test");
const assert = require("node:assert/strict");
const { isGm, isLocalAddress, isLocalRequest, requestAddress, recordGmKey } = require("../lib/auth");

function stateWith(key) {
  return key ? { settings: { gmKey: key } } : { settings: {} };
}

test("isGm braucht as=gm", () => {
  assert.equal(isGm(stateWith(null), {}), false);
  assert.equal(isGm(stateWith(null), { as: "player" }), false);
  assert.equal(isGm(null, { as: "gm" }), false);
});

test("ohne bekannten Schluessel ist der SL nur am SL-Rechner offen", () => {
  assert.equal(isGm(stateWith(null), { as: "gm" }, fakeReq("127.0.0.1")), true);
  assert.equal(isGm(stateWith(null), { as: "gm" }, fakeReq("192.168.1.20")), false);
  assert.equal(isGm(stateWith(null), { as: "gm" }, fakeReq("127.0.0.1", { "cf-connecting-ip": "203.0.113.9" })), false);
  assert.equal(isGm(stateWith(null), { as: "gm" }), false);
});

test("leerer Proxy-Header zaehlt trotzdem als Tunnel", () => {
  assert.equal(isLocalRequest(fakeReq("127.0.0.1", { "x-forwarded-for": "" })), false);
});

test("recordGmKey nimmt keinen Riesen-Schluessel", () => {
  const state = { settings: {} };
  assert.equal(recordGmKey(state, { role: "gm", gmKey: "x".repeat(201) }, "127.0.0.1"), false);
  assert.equal(state.settings.gmKey, undefined);
});

test("falscher Schluessel wird abgelehnt", () => {
  assert.equal(isGm(stateWith("gm_abc"), { as: "gm", gmKey: "gm_xyz" }), false);
  assert.equal(isGm(stateWith("gm_abc"), { as: "gm" }), false);
  assert.equal(isGm(stateWith("gm_abc"), { as: "gm", gmKey: "" }), false);
});

test("richtiger Schluessel oeffnet", () => {
  assert.equal(isGm(stateWith("gm_abc"), { as: "gm", gmKey: "gm_abc" }), true);
});

test("recordGmKey setzt nur beim GM-Ping vom SL-Rechner", () => {
  const state = { settings: {} };
  assert.equal(recordGmKey(state, { role: "player", gmKey: "gm_1" }, "127.0.0.1"), false);
  assert.equal(recordGmKey(state, { role: "gm", gmKey: "" }, "127.0.0.1"), false);
  assert.equal(recordGmKey(state, { role: "gm", gmKey: "gm_1" }, "192.168.0.10"), false);
  assert.equal(state.settings.gmKey, undefined);
  assert.equal(recordGmKey(state, { role: "gm", gmKey: "gm_1" }, "127.0.0.1"), true);
  assert.equal(state.settings.gmKey, "gm_1");
});

test("recordGmKey folgt am SL-Rechner der aktuellen PIN", () => {
  const state = { settings: { gmKey: "gm_alt" } };
  assert.equal(recordGmKey(state, { role: "gm", gmKey: "gm_neu" }, "127.0.0.1"), true);
  assert.equal(state.settings.gmKey, "gm_neu");
  assert.equal(recordGmKey(state, { role: "gm", gmKey: "gm_neu" }, "127.0.0.1"), false);
});

test("Localhost-Adressen werden erkannt", () => {
  for (const a of ["127.0.0.1", "::1", "::ffff:127.0.0.1", "localhost"]) assert.equal(isLocalAddress(a), true);
  assert.equal(isLocalAddress("192.168.0.5"), false);
  assert.equal(isLocalAddress(""), false);
});

function fakeReq(remote, headers = {}) {
  return { socket: { remoteAddress: remote }, headers };
}

test("lokale Anfrage ohne Proxy gilt als dieser Rechner", () => {
  assert.equal(isLocalRequest(fakeReq("127.0.0.1")), true);
  assert.equal(isLocalRequest(fakeReq("::1")), true);
  assert.equal(isLocalRequest(fakeReq("::ffff:127.0.0.1")), true);
});

test("Tunnel-Anfragen sind nie lokal, auch von 127.0.0.1", () => {
  assert.equal(isLocalRequest(fakeReq("127.0.0.1", { "cf-connecting-ip": "203.0.113.9" })), false);
  assert.equal(isLocalRequest(fakeReq("127.0.0.1", { "x-forwarded-for": "203.0.113.9" })), false);
  assert.equal(isLocalRequest(fakeReq("127.0.0.1", { "cf-ray": "abc" })), false);
  assert.equal(requestAddress(fakeReq("127.0.0.1", { "cf-connecting-ip": "1.2.3.4" })), "tunnel");
});

test("LAN-Adressen sind nicht lokal", () => {
  assert.equal(isLocalRequest(fakeReq("192.168.1.20")), false);
  assert.equal(isLocalRequest(fakeReq("")), false);
});

test("recordGmKey nimmt keinen Schluessel ueber den Tunnel an", () => {
  const state = { settings: {} };
  const remote = requestAddress(fakeReq("127.0.0.1", { "cf-connecting-ip": "1.2.3.4" }));
  assert.equal(recordGmKey(state, { role: "gm", gmKey: "gm_x" }, remote), false);
  assert.equal(state.settings.gmKey, undefined);
});

test("ganz 127.0.0.0/8 zählt als lokal", () => {
  assert.equal(isLocalAddress("127.0.1.1"), true);
  assert.equal(isLocalAddress("::ffff:127.0.0.2"), true);
  assert.equal(isLocalAddress("127.evil.example"), false);
  assert.equal(isLocalAddress("10.127.0.1"), false);
});
