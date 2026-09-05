/**
 * QR encode/decode for Recovery Codes (same payload as .apnote).
 */

import QRCode from "qrcode";

type JsQrFn = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options?: { inversionAttempts?: string }
) => { data: string } | null;

async function loadJsQr(): Promise<JsQrFn> {
  const mod: unknown = await import("jsqr");
  if (typeof mod === "function") return mod as JsQrFn;
  if (mod && typeof mod === "object" && "default" in mod) {
    const d = (mod as { default: unknown }).default;
    if (typeof d === "function") return d as JsQrFn;
  }
  throw new Error("jsqr module did not export a decoder function");
}

/** Encode recovery code (or any AP1- string) as a PNG data URL for display/download. */
export async function generateQrDataUrl(
  recoveryCode: string,
  opts?: { width?: number; margin?: number }
): Promise<string> {
  const text = recoveryCode.trim();
  if (!text) throw new Error("empty recovery code for QR");
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: "M",
    margin: opts?.margin ?? 2,
    width: opts?.width ?? 320,
    type: "image/png",
  });
}

/** Write recovery code QR as PNG bytes (CLI / file export). */
export async function generateQrPng(
  recoveryCode: string,
  opts?: { width?: number; margin?: number }
): Promise<Uint8Array> {
  const text = recoveryCode.trim();
  if (!text) throw new Error("empty recovery code for QR");
  const buf = await QRCode.toBuffer(text, {
    errorCorrectionLevel: "M",
    margin: opts?.margin ?? 2,
    width: opts?.width ?? 320,
    type: "png",
  });
  return new Uint8Array(buf);
}

/**
 * Decode a QR from raw RGBA image data (e.g. canvas getImageData).
 * Returns the payload string (expected: AP1-… recovery code).
 */
export async function decodeQrFromImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number
): Promise<string> {
  const jsQR = await loadJsQr();
  const result = jsQR(data, width, height, { inversionAttempts: "attemptBoth" });
  if (!result?.data) throw new Error("no QR code found in image");
  return String(result.data).trim();
}
