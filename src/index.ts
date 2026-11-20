import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";

export interface DiogenesPluginConfig {
  gatewayUrl?: string;
  demoMode?: boolean;
  solanaKeypairBase58?: string;
  solanaRpcUrl?: string;
  sessionKey?: string;
  maxPaymentLamports?: number; // Safety budget cap per call (default: 500,000 lamports = 0.0005 SOL)
  requestTimeoutMs?: number;
}

const DEFAULT_GATEWAY_URL = "https://diogenesgateway.com";
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_LAMPORTS = 500000; // 0.0005 SOL
const DEFAULT_SOLANA_RPC = "https://api.mainnet-beta.solana.com";
const DEFAULT_TREASURY_SOLANA = "5RwSxvj4A2LPLPSQQkiGUdbp7uCfgHd1Ao7V21a6Ahmm";

export class DiogenesClient {
  private gatewayUrl: string;
  private demoMode: boolean;
  private keypairBase58?: string;
  private solanaRpcUrl: string;
  private sessionKey?: string;
  private maxPaymentLamports: number;
  private timeoutMs: number;

  constructor(config: DiogenesPluginConfig = {}) {
    this.gatewayUrl = (config.gatewayUrl || DEFAULT_GATEWAY_URL).replace(/\/+$/, "");
    this.keypairBase58 = config.solanaKeypairBase58;
    this.solanaRpcUrl = config.solanaRpcUrl || DEFAULT_SOLANA_RPC;
    this.sessionKey = config.sessionKey;
    this.maxPaymentLamports = config.maxPaymentLamports ?? DEFAULT_MAX_LAMPORTS;
    this.timeoutMs = config.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    // Default to demoMode only if neither a session key nor a funded keypair is provided
    this.demoMode = config.demoMode ?? !(this.sessionKey || this.keypairBase58);
  }

  /**
   * Autonomously signs and broadcasts a micro-transfer on Solana mainnet to satisfy an x402 challenge
   */
  async executeAutonomousPayment(recipient: string, amountLamports: number): Promise<string> {
    if (!this.keypairBase58) {
      throw new Error("No Solana keypair configured for autonomous payment.");
    }
    if (amountLamports > this.maxPaymentLamports) {
      throw new Error(
        `Autonomous payment rejected: Requested ${amountLamports} lamports exceeds configured safety cap of ${this.maxPaymentLamports} lamports.`
      );
    }

    let keypair: Keypair;
    try {
      const secretKey = bs58.decode(this.keypairBase58.trim());
      keypair = await Keypair.fromSecretKey(secretKey);
    } catch (e: any) {
      throw new Error(`Invalid SOLANA_KEYPAIR_BASE58 private key format: ${e.message}`);
    }

    const connection = new Connection(this.solanaRpcUrl, "confirmed");
    const recipientPubkey = new PublicKey(recipient || DEFAULT_TREASURY_SOLANA);

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: recipientPubkey,
        lamports: BigInt(amountLamports),
      })
    );
    tx.recentBlockhash = blockhash;
    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.feePayer = keypair.publicKey;

    return await sendAndConfirmTransaction(connection, tx, [keypair], {
      commitment: "confirmed",
      skipPreflight: false,
    });
  }

  async callEndpoint(endpoint: string, payload: Record<string, unknown>): Promise<any> {
    let url = `${this.gatewayUrl}${endpoint}`;
    if (this.demoMode && !url.includes("?demo=true")) {
      url += "?demo=true";
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "ElizaOS-DiogenesPlugin/2.1",
    };

    if (this.sessionKey) {
      headers["Authorization"] = `Bearer ${this.sessionKey}`;
      headers["X-Diogenes-Key"] = this.sessionKey;
    }

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err: any) {
      if (err.name === "TimeoutError" || err.name === "AbortError") {
        throw new Error(`Diogenes Gateway request timed out after ${this.timeoutMs}ms`);
      }
      throw new Error(`Network error calling Diogenes Gateway: ${err.message}`);
    }

    // Handle 402 Payment Required
    if (res.status === 402) {
      const challenge = await res.json().catch(() => ({}));

      // If agent has a Solana wallet and is not in demo mode, execute autonomous micro-payment
      if (!this.demoMode && this.keypairBase58) {
        const solanaChallenge = challenge?.rail_options?.solana_x402;
        const recipient = solanaChallenge?.recipient || DEFAULT_TREASURY_SOLANA;
        const requiredLamports = Number(solanaChallenge?.amount_lamports || 50000);

        const txSignature = await this.executeAutonomousPayment(recipient, requiredLamports);

        // Retry request with Solana payment proof headers
        const retryHeaders: Record<string, string> = {
          ...headers,
          "X-Payment-Signature": txSignature,
          "PAYMENT-SIGNATURE": txSignature,
          "Authorization": `x402 ${txSignature}`,
        };

        const targetUrl = url.replace(/[?&]demo=true/, "");
        const retryRes = await fetch(targetUrl, {
          method: "POST",
          headers: retryHeaders,
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (!retryRes.ok) {
          const errText = await retryRes.text().catch(() => "");
          throw new Error(`Diogenes Gateway returned HTTP ${retryRes.status} after payment: ${errText.slice(0, 300)}`);
        }

        return await retryRes.json();
      }

      throw new Error(`Payment Required: ${JSON.stringify(challenge)}`);
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Diogenes Gateway returned HTTP ${res.status}: ${errText.slice(0, 300)}`);
    }

    return await res.json();
  }

  async checkSplTokenRisk(mintAddress: string, riskProfile: string = "allow_regulated_stablecoins"): Promise<any> {
    if (!mintAddress || !/^[1-9A-HJ-NP-za-km-z]{32,44}$/.test(mintAddress)) {
      throw new Error("Invalid Solana SPL token mint address format (expected Base58 32-44 characters).");
    }
    return this.callEndpoint("/api/v1/crypto/solana-risk", {
      mint_address: mintAddress,
      risk_profile: riskProfile,
    });
  }

  async auditSolanaProgram(code: string): Promise<any> {
    if (!code || typeof code !== "string" || code.trim().length === 0) {
      throw new Error("Contract code cannot be empty for security audit.");
    }
    return this.callEndpoint("/api/v1/agent/contract-audit", {
      contract_code: code,
      language: "rust_anchor",
    });
  }

  async verifyGuardrail(input: string, context: string = ""): Promise<any> {
    if (!input || typeof input !== "string" || input.trim().length === 0) {
      throw new Error("Input command or prompt text cannot be empty for guardrail verification.");
    }
    return this.callEndpoint("/api/v1/agent/guardrail-verify", {
      input,
      context,
    });
  }
}

export function getClientFromRuntime(runtime?: any): DiogenesClient {
  const gatewayUrl =
    runtime?.getSetting?.("DIOGENES_GATEWAY_URL") ||
    process.env.DIOGENES_GATEWAY_URL ||
    DEFAULT_GATEWAY_URL;

  const sessionKey =
    runtime?.getSetting?.("DIOGENES_SESSION_KEY") ||
    runtime?.getSetting?.("DIOGENES_API_KEY") ||
    process.env.DIOGENES_SESSION_KEY ||
    process.env.DIOGENES_API_KEY;

  const solanaKeypairBase58 =
    runtime?.getSetting?.("SOLANA_KEYPAIR_BASE58") ||
    runtime?.getSetting?.("SOLANA_PRIVATE_KEY") ||
    process.env.SOLANA_KEYPAIR_BASE58 ||
    process.env.SOLANA_PRIVATE_KEY;

  const solanaRpcUrl =
    runtime?.getSetting?.("SOLANA_RPC_URL") ||
    process.env.SOLANA_RPC_URL ||
    DEFAULT_SOLANA_RPC;

  const demoSetting =
    runtime?.getSetting?.("DIOGENES_DEMO_MODE") ??
    process.env.DIOGENES_DEMO_MODE;

  const demoMode =
    demoSetting !== undefined
      ? String(demoSetting).toLowerCase() !== "false"
      : !(sessionKey || solanaKeypairBase58);

  return new DiogenesClient({ gatewayUrl, demoMode, solanaKeypairBase58, solanaRpcUrl, sessionKey });
}

/**
 * ElizaOS Plugin Definition
 */
export const diogenesPlugin = {
  name: "diogenes",
  description: "Diogenes Autonomous Edge Microservices & Solana Security Plugin: SPL token risk audits, Anchor contract verifier, and agent guardrails",

  actions: [
    {
      name: "EVALUATE_SOLANA_TOKEN_RISK",
      similes: [
        "CHECK_SPL_TOKEN_RISK",
        "INSPECT_SOLANA_TOKEN",
        "AUDIT_SPL_TOKEN",
        "CHECK_FREEZE_AUTHORITY",
        "EVALUATE_TOKEN_RISK",
        "SOLANA_HONEYPOT_CHECK",
      ],
      description: "Inspect a Solana SPL token mint address for freeze authority, mint authority, honeypot tax, and security risks before trading",
      examples: [
        [
          {
            user: "user",
            content: { text: "Can you check if token mint 7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr is safe to buy?" },
          },
          {
            user: "agent",
            content: {
              text: "I am auditing the Solana SPL token mint with Diogenes Risk Oracle...",
              action: "EVALUATE_SOLANA_TOKEN_RISK",
            },
          },
        ],
      ],
      validate: async (_runtime: any, message: any) => {
        const text = message.content?.text || "";
        const mint = message.content?.mintAddress || text.match(/[1-9A-HJ-NP-za-km-z]{32,44}/)?.[0];
        return Boolean(mint);
      },
      handler: async (runtime: any, message: any, _state: any, _options: any, callback: any) => {
        const client = getClientFromRuntime(runtime);
        const mint = message.content?.mintAddress || message.content?.text?.match(/[1-9A-HJ-NP-za-km-z]{32,44}/)?.[0];

        if (!mint) {
          callback?.({ text: "Please provide a valid Solana SPL token mint address to inspect." });
          return false;
        }

        try {
          const result = await client.checkSplTokenRisk(mint);
          const p = result.preview || result;
          const reasonStr = Array.isArray(p.reason_codes) && p.reason_codes.length > 0 ? p.reason_codes.join(", ") : "CLEAN";
          const standardStr = p.token_standard || "spl-token";
          const slotStr = p.slot ? ` | Slot: ${p.slot}` : "";
          const shouldTransact = p.should_transact === true;

          callback?.({
            text: `Token Audit for ${mint}:\nVerdict: ${shouldTransact ? "SAFE" : "CAUTION"}\nRisk Score: ${p.risk_score ?? "Low"}\nStandard: ${standardStr}${slotStr}\nFreeze Authority: ${p.has_freeze_authority ? "ACTIVE" : "Disabled"}\nReason Codes: ${reasonStr}`,
            content: result,
          });
          return shouldTransact;
        } catch (err: any) {
          callback?.({ text: `Failed to inspect token: ${err.message}` });
          return false;
        }
      },
    },
    {
      name: "AUDIT_SMART_CONTRACT",
      similes: [
        "AUDIT_ANCHOR_PROGRAM",
        "AUDIT_SOLANA_CONTRACT",
        "VERIFY_SMART_CONTRACT",
      ],
      description: "Audit Solana Anchor or EVM smart contract code for honeypot logic, reentrancy bugs, and missing signer checks",
      examples: [
        [
          {
            user: "user",
            content: { text: "Can you audit this Solana program code for vulnerabilities?" },
          },
          {
            user: "agent",
            content: {
              text: "Auditing program code with Diogenes Contract Audit Oracle...",
              action: "AUDIT_SMART_CONTRACT",
            },
          },
        ],
      ],
      validate: async (_runtime: any, message: any) => {
        const text = (message.content?.text || "").toLowerCase();
        return (
          Boolean(message.content?.code) ||
          text.includes("audit") ||
          text.includes("program") ||
          text.includes("contract")
        );
      },
      handler: async (runtime: any, message: any, _state: any, _options: any, callback: any) => {
        const client = getClientFromRuntime(runtime);
        const code = message.content?.code || message.content?.text;

        if (!code || typeof code !== "string" || code.trim().length === 0) {
          callback?.({ text: "Please provide valid contract source code to audit." });
          return false;
        }

        try {
          const result = await client.auditSolanaProgram(code);
          const p = result.preview || result;
          const passed = p.audit_passed === true;
          callback?.({
            text: `Smart Contract Audit Result:\nVerdict: ${passed ? "PASS" : "WARN"}\nVulnerabilities Found: ${p.vulnerabilities?.length ?? 0}`,
            content: result,
          });
          return passed;
        } catch (err: any) {
          callback?.({ text: `Audit error: ${err.message}` });
          return false;
        }
      },
    },
    {
      name: "ENFORCE_GUARDRAIL",
      similes: [
        "VERIFY_GUARDRAIL",
        "PRE_EXECUTION_SECURITY_CHECK",
        "CHECK_PROMPT_INJECTION",
      ],
      description: "Pre-execution security gate to prevent prompt injection and destructive shell commands (fails closed for safety)",
      examples: [
        [
          {
            user: "user",
            content: { text: "Verify this action input against security guardrails." },
          },
          {
            user: "agent",
            content: {
              text: "Evaluating command against Diogenes Security Guardrail...",
              action: "ENFORCE_GUARDRAIL",
            },
          },
        ],
      ],
      validate: async (_runtime: any, message: any) => {
        return Boolean(message.content?.text || message.content?.input);
      },
      handler: async (runtime: any, message: any, _state: any, _options: any, callback: any) => {
        const client = getClientFromRuntime(runtime);
        const input = message.content?.input || message.content?.text || "";

        if (!input || typeof input !== "string" || input.trim().length === 0) {
          // Fail closed
          callback?.({ text: "[BLOCKED] Empty input supplied to guardrail verification." });
          return false;
        }

        try {
          const result = await client.verifyGuardrail(input);
          const p = result.preview || result;
          const verdict = p.verdict || (p.safe === true ? "ALLOW" : "BLOCK");
          const isAllowed = verdict === "ALLOW" || p.safe === true;

          if (!isAllowed) {
            callback?.({
              text: `[BLOCKED] Action intercepted by Diogenes Security Guardrail: ${p.reason || "Policy violation detected"}`,
              content: result,
            });
            return false;
          }

          callback?.({ text: `[ALLOWED] Security guardrail passed.`, content: result });
          return true;
        } catch (err: any) {
          // Fail closed for security
          callback?.({
            text: `[BLOCKED] Guardrail failed closed due to verification error: ${err.message}`,
          });
          return false;
        }
      },
    },
  ],
};

export const plugin = diogenesPlugin;
export default diogenesPlugin;
