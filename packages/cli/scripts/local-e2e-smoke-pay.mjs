/**
 * Obsolete: offline sealed payment path removed with shielded transfer.
 * Product smoke: npm run smoke:e2e (deposit → withdraw1).
 */
console.log(
  JSON.stringify({
    ok: true,
    skipped: true,
    obsolete: true,
    reason:
      "SMOKE_PAY / sealed transfer delivery removed — product path is deposit → withdraw1",
    use: "npm run smoke:e2e",
  })
);
