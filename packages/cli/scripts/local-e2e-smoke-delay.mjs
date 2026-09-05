/**
 * Delay smoke retired — on-chain withdraw delay was removed from ShieldedPool.
 * See WITHDRAW_TIMING_POLICY_V1.md. Use: npm run smoke:e2e
 */
console.log(
  JSON.stringify({
    ok: true,
    skipped: true,
    reason:
      "minWithdrawDelay / on-chain withdraw delay removed (WITHDRAW_TIMING_POLICY_V1.md)",
    use: "npm run smoke:e2e",
  })
);
