# Diogenes Plugin for ElizaOS

A drop-in **ElizaOS** plugin equipping autonomous Solana agents with:
- **SPL Token Risk Audits (`EVALUATE_SOLANA_TOKEN_RISK`)**: Verify freeze authority, mint authority, Token-2022 extensions, and honeypot transfer taxes before executing token swaps.
- **Smart Contract Honeypot Audits (`AUDIT_SMART_CONTRACT`)**: Audit Anchor and Solana Rust programs for backdoors, missing signer checks, and reentrancy bugs.
- **Pre-Execution Guardrails (`ENFORCE_GUARDRAIL`)**: Intercept user prompts and agent thoughts for prompt injection, key exfiltration, and wallet drains.
- **x402 Micropayments & Zero-Fee Demo Mode**: Instant testing with `demoMode: true`.

---

## 🚀 Installation

```bash
# Install from npm
npm install @diogenesgateway/plugin-diogenes
```

---

## 🛠️ Usage in ElizaOS Character

Add `diogenesPlugin` to your character's `plugins` array:

```typescript
import { diogenesPlugin } from "@diogenesgateway/plugin-diogenes";

export const character = {
  name: "SolanaSecurityAgent",
  plugins: [diogenesPlugin],
  system: "You are an autonomous on-chain trader that verifies SPL token safety and audits contracts before executing transactions.",
  // ...
};
```

---

## ⚡ Actions Available

### 1. `EVALUATE_SOLANA_TOKEN_RISK`
Analyzes any SPL token mint address in real time:
```text
User: "Is mint 7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr safe to buy?"
Agent: "Auditing SPL token with Diogenes Risk Oracle...
Verdict: SAFE
Risk Score: Low
Standard: spl-token | Slot: 320184912
Freeze Authority: Disabled (Safe)
Reason Codes: CLEAN"
```

Similes / Aliases:
- `CHECK_SPL_TOKEN_RISK`
- `INSPECT_SOLANA_TOKEN`
- `AUDIT_SPL_TOKEN`
- `CHECK_FREEZE_AUTHORITY`

### 2. `AUDIT_SMART_CONTRACT`
Audits Anchor / Rust / Solidity code for backdoors and reentrancy bugs:
```text
User: "Can you review this Anchor program instruction for vulnerabilities?"
Agent: "Running contract audit...
Verdict: PASS
Vulnerabilities Found: 0"
```

### 3. `ENFORCE_GUARDRAIL`
Pre-execution security barrier verifying that agent commands and prompts are free of prompt injection or destructive terminal instructions.

---

## 🌐 Endpoints & Edge Infrastructure
- **Live Gateway**: [https://diogenesgateway.com](https://diogenesgateway.com)
- **MCP Catalog**: [https://diogenesgateway.com/.well-known/mcp.json](https://diogenesgateway.com/.well-known/mcp.json)
- **Solana x402 Treasury**: `3vuU9jvaohMG6oPY7NVrUggcSJ4CuhcByxoQk68EC6hj`
