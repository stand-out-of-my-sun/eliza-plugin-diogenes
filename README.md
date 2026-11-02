# Diogenes Plugin for ElizaOS

A drop-in **ElizaOS** plugin equipping autonomous Solana agents with:
- **SPL Token Risk Audits**: Verify freeze authority, mint authority, and honeypot transfer taxes before executing token swaps.
- **Smart Contract Honeypot Audits**: Audit Anchor and Solana Rust programs before signing transactions.
- **Pre-Execution Guardrails**: Evaluate user prompts and agent thoughts for prompt injection, key exfiltration, and wallet drains.
- **x402 Micropayments & Zero-Fee Demo Mode**: Instant testing with `demoMode: true`.

---

## 🚀 Installation

```bash
# Add to your ElizaOS project
npm install @diogenes/elizaos-plugin
# or link locally from integrations/elizaos
```

---

## 🛠️ Usage in ElizaOS Character

Add `diogenesPlugin` to your character's `plugins` array:

```typescript
import { diogenesPlugin } from "@diogenes/elizaos-plugin";

export const character = {
  name: "SolanaSecurityAgent",
  plugins: [diogenesPlugin],
  system: "You are an autonomous on-chain trader that verifies SPL token safety and audits contracts before executing transactions.",
  // ...
};
```

---

## ⚡ Actions Available

### 1. `CHECK_SPL_TOKEN_RISK`
Analyzes any SPL token mint address in real time:
```text
User: "Is mint 7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr safe to buy?"
Agent: "Auditing SPL token with Diogenes Risk Oracle...
Verdict: SAFE
Freeze Authority: Disabled (Safe)
Mint Authority: Revoked (Safe)"
```

### 2. `AUDIT_SMART_CONTRACT`
Audits Anchor / Rust / Solidity code for backdoors and reentrancy bugs:
```text
User: "Can you review this Anchor program instruction for vulnerabilities?"
Agent: "Running contract audit... 0 critical vulnerabilities found."
```

### 3. `ENFORCE_GUARDRAIL`
Pre-execution security barrier verifying that agent commands and prompts are free of prompt injection or destructive terminal instructions.

---

## 🌐 Endpoints & Edge Infrastructure
- **Live Gateway**: [https://diogenes-micro-gateway.corinth.workers.dev](https://diogenes-micro-gateway.corinth.workers.dev)
- **MCP Catalog**: [https://diogenes-micro-gateway.corinth.workers.dev/.well-known/mcp.json](https://diogenes-micro-gateway.corinth.workers.dev/.well-known/mcp.json)
- **Solana x402 Treasury**: `3vuU9jvaohMG6oPY7NVrUggcSJ4CuhcByxoQk68EC6hj`
