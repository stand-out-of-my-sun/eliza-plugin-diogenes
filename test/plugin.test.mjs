import test from "node:test";
import assert from "node:assert/strict";
import { DiogenesClient, diogenesPlugin, getClientFromRuntime } from "../dist/index.js";

test("DiogenesClient initializes with defaults and respects runtime settings", () => {
  const defaultClient = new DiogenesClient();
  assert.ok(defaultClient);

  const mockRuntime = {
    getSetting: (key) => {
      if (key === "DIOGENES_GATEWAY_URL") return "https://custom.diogenesgateway.com";
      if (key === "DIOGENES_DEMO_MODE") return "false";
      return null;
    }
  };

  const runtimeClient = getClientFromRuntime(mockRuntime);
  assert.ok(runtimeClient);
});

test("EVALUATE_SOLANA_TOKEN_RISK validate accepts base58 mint addresses and rejects invalid", async () => {
  const action = diogenesPlugin.actions.find(a => a.name === "EVALUATE_SOLANA_TOKEN_RISK");
  assert.ok(action);

  const validMsg = { content: { text: "Audit token EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" } };
  const invalidMsg = { content: { text: "Hello world no token here" } };

  assert.equal(await action.validate(null, validMsg), true);
  assert.equal(await action.validate(null, invalidMsg), false);
});

test("AUDIT_SMART_CONTRACT validate accepts code/audit keywords", async () => {
  const action = diogenesPlugin.actions.find(a => a.name === "AUDIT_SMART_CONTRACT");
  assert.ok(action);

  assert.equal(await action.validate(null, { content: { text: "audit this contract" } }), true);
  assert.equal(await action.validate(null, { content: { text: "what is the weather today?" } }), false);
});

test("ENFORCE_GUARDRAIL validate accepts input and handler fails closed on empty or error", async () => {
  const action = diogenesPlugin.actions.find(a => a.name === "ENFORCE_GUARDRAIL");
  assert.ok(action);

  assert.equal(await action.validate(null, { content: { text: "rm -rf /" } }), true);
  assert.equal(await action.validate(null, { content: {} }), false);

  let callbackResult = null;
  const passed = await action.handler(null, { content: { text: "" } }, null, null, (res) => {
    callbackResult = res;
  });

  // Must fail closed (return false)
  assert.equal(passed, false);
  assert.match(callbackResult.text, /\[BLOCKED\]/);
});

test("DiogenesClient defaults demoMode based on sessionKey or solanaKeypairBase58", () => {
  const mockKeypair = "5MIIHsEfd5p7s8ZJk5yT3q7...";
  const clientWithKey = new DiogenesClient({ sessionKey: "dg_sec_test123" });
  assert.equal(clientWithKey.demoMode, false);

  const clientWithSolana = new DiogenesClient({ solanaKeypairBase58: mockKeypair });
  assert.equal(clientWithSolana.demoMode, false);

  const clientDefault = new DiogenesClient();
  assert.equal(clientDefault.demoMode, true);
});

test("executeAutonomousPayment throws on budget cap excess", async () => {
  const client = new DiogenesClient({
    solanaKeypairBase58: "2bkm4oGgVqL2C2K9yS...",
    maxPaymentLamports: 100000,
  });

  await assert.rejects(
    () => client.executeAutonomousPayment("5RwSxvj4A2LPLPSQQkiGUdbp7uCfgHd1Ao7V21a6Ahmm", 200000),
    /Autonomous payment rejected: Requested 200000 lamports exceeds configured safety cap of 100000 lamports/
  );
});

test("executeAutonomousPayment throws on invalid base58 key", async () => {
  const client = new DiogenesClient({
    solanaKeypairBase58: "not-a-valid-base58-key!!!",
  });

  await assert.rejects(
    () => client.executeAutonomousPayment("5RwSxvj4A2LPLPSQQkiGUdbp7uCfgHd1Ao7V21a6Ahmm", 50000),
    /Invalid SOLANA_KEYPAIR_BASE58 private key format/
  );
});

test("callEndpoint handles 402 and attaches payment proof on retry", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCallCount = 0;
  let retryHeadersPassed = null;

  globalThis.fetch = async (url, options) => {
    fetchCallCount++;
    if (fetchCallCount === 1) {
      return {
        status: 402,
        ok: false,
        json: async () => ({
          error: "Payment Required",
          rail_options: {
            solana_x402: {
              recipient: "5RwSxvj4A2LPLPSQQkiGUdbp7uCfgHd1Ao7V21a6Ahmm",
              amount_lamports: 50000,
            },
          },
        }),
      };
    }
    retryHeadersPassed = options.headers;
    return {
      status: 200,
      ok: true,
      json: async () => ({ status: "success", audited: true }),
    };
  };

  try {
    const client = new DiogenesClient({
      solanaKeypairBase58: "testKey",
      demoMode: false,
    });
    // Stub autonomous payment to avoid live RPC in test
    client.executeAutonomousPayment = async () => "mock_solana_signature_abc123";

    const res = await client.callEndpoint("/api/v1/crypto/solana-risk", { mint_address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" });
    assert.equal(fetchCallCount, 2);
    assert.equal(res.audited, true);
    assert.equal(retryHeadersPassed["X-Payment-Signature"], "mock_solana_signature_abc123");
    assert.equal(retryHeadersPassed["PAYMENT-SIGNATURE"], "mock_solana_signature_abc123");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

