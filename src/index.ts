/**
 * Diogenes Plugin for ElizaOS
 * Provides autonomous Solana agents with real-time SPL token risk inspection,
 * smart contract honeypot audits, pre-execution safety guardrails, and x402 micropayments.
 */

export interface DiogenesPluginConfig {
  gatewayUrl?: string;
  demoMode?: boolean;
  solanaKeypairBase58?: string;
}

const DEFAULT_GATEWAY_URL = "https://diogenes-micro-gateway.corinth.workers.dev";
const SOLANA_X402_WALLET = "3vuU9jvaohMG6oPY7NVrUggcSJ4CuhcByxoQk68EC6hj";

export class DiogenesClient {
  private gatewayUrl: string;
  private demoMode: boolean;
  private keypairBase58?: string;

  constructor(config: DiogenesPluginConfig = {}) {
    this.gatewayUrl = (config.gatewayUrl || DEFAULT_GATEWAY_URL).replace(/\/$/, "");
    this.demoMode = config.demoMode ?? true; // Default to demo mode for safety
    this.keypairBase58 = config.solanaKeypairBase58;
  }

  async callEndpoint(endpoint: string, payload: Record<string, unknown>): Promise<any> {
    let url = `${this.gatewayUrl}${endpoint}`;
    if (this.demoMode && !url.includes("?demo=true")) {
      url += "?demo=true";
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "ElizaOS-DiogenesPlugin/1.0",
    };

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (res.status === 402 && !this.demoMode && this.keypairBase58) {
      // In production x402 mode, client can sign transaction or pass signature
      const challenge = await res.json();
      throw new Error(`Payment Required: ${JSON.stringify(challenge)}`);
    }

    return await res.json();
  }

  /**
   * Evaluates SPL token mint address for active freeze authority, mint authority,
   * honeypot transfer taxes, and binary should_transact verdict.
   */
  async checkSplTokenRisk(mintAddress: string): Promise<any> {
    return this.callEndpoint("/api/v1/crypto/solana-risk", {
      mint_address: mintAddress,
    });
  }

  /**
   * Audits Anchor or Rust smart contract code before deployment or invocation.
   */
  async auditSolanaProgram(code: string): Promise<any> {
    return this.callEndpoint("/api/v1/agent/contract-audit", {
      contract_code: code,
      language: "rust_anchor",
    });
  }

  /**
   * Evaluates prompt or action text for prompt injection, key theft, or destructive commands.
   */
  async verifyGuardrail(input: string, context: string = ""): Promise<any> {
    return this.callEndpoint("/api/v1/agent/guardrail-verify", {
      input,
      context,
    });
  }
}

/**
 * ElizaOS Plugin Definition
 */
export const diogenesPlugin = {
  name: "diogenes",
  description: "Diogenes Autonomous Edge Microservices & Solana Security Plugin",

  actions: [
    {
      name: "CHECK_SPL_TOKEN_RISK",
      description: "Inspect a Solana SPL token mint address for freeze authority, honeypot tax, and security risks before trading",
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
              action: "CHECK_SPL_TOKEN_RISK",
            },
          },
        ],
      ],
      validate: async () => true,
      handler: async (runtime: any, message: any, state: any, options: any, callback: any) => {
        const client = new DiogenesClient({ demoMode: true });
        const mint = message.content?.mintAddress || message.content?.text?.match(/[1-9A-HJ-NP-za-km-z]{32,44}/)?.[0];
        
        if (!mint) {
          callback?.({ text: "Please provide a valid Solana SPL token mint address to inspect." });
          return false;
        }

        try {
          const result = await client.checkSplTokenRisk(mint);
          callback?.({
            text: `Token Audit for ${mint}:\nVerdict: ${result.preview?.should_transact ? "SAFE" : "CAUTION"}\nRisk Score: ${result.preview?.risk_score ?? "Low"}\nFreeze Authority: ${result.preview?.has_freeze_authority ? "ACTIVE (Risk)" : "Disabled (Safe)"}`,
            content: result,
          });
          return true;
        } catch (err: any) {
          callback?.({ text: `Failed to inspect token: ${err.message}` });
          return false;
        }
      },
    },
    {
      name: "AUDIT_SMART_CONTRACT",
      description: "Audit Solana Anchor or EVM smart contract code for honeypot logic and reentrancy bugs",
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
      validate: async () => true,
      handler: async (runtime: any, message: any, state: any, options: any, callback: any) => {
        const client = new DiogenesClient({ demoMode: true });
        const code = message.content?.code || message.content?.text;
        
        try {
          const result = await client.auditSolanaProgram(code);
          callback?.({
            text: `Smart Contract Audit Result:\nVerdict: ${result.preview?.audit_passed ? "PASS" : "WARN"}\nVulnerabilities Found: ${result.preview?.vulnerabilities?.length ?? 0}`,
            content: result,
          });
          return true;
        } catch (err: any) {
          callback?.({ text: `Audit error: ${err.message}` });
          return false;
        }
      },
    },
    {
      name: "ENFORCE_GUARDRAIL",
      description: "Pre-execution security gate to prevent prompt injection and destructive shell commands",
      validate: async () => true,
      handler: async (runtime: any, message: any, state: any, options: any, callback: any) => {
        const client = new DiogenesClient({ demoMode: true });
        const input = message.content?.text || "";
        const result = await client.verifyGuardrail(input);
        callback?.({ text: `Guardrail evaluated: ${result.preview?.verdict || "OK"}`, content: result });
        return true;
      },
    },
  ],
};

export default diogenesPlugin;
