/**
 * OBSOLETE: shielded transfer was removed from the protocol.
 * Offline payment now uses withdraw / OOB note delivery — see drill:payment-receipt
 * and NOTE_DELIVERY_ADOPTED_V1.md. This drill intentionally no-ops so gate:dev stays green.
 *
 * Usage:
 *   node packages/cli/scripts/drill-pay.mjs
 *   ap drill pay
 */
console.log(
  JSON.stringify(
    {
      ok: true,
      skipped: true,
      drill: "offline-pay-transfer-deliver",
      obsolete: true,
      reason:
        "Shielded transfer removed. Product spend path is withdraw only. Use drill:payment-receipt / OOB note delivery.",
    },
    null,
    2
  )
);
