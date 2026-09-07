/**
 * Packs and unpacks the pairing code two phones swap to find each other.
 *
 * The code carries a WebRTC session description: a couple of kilobytes of very
 * repetitive text, which is far more than a QR code a phone can read across a
 * table will hold. Deflating it first brings it down to a few hundred bytes,
 * and base64url keeps it to characters that survive being typed, pasted, or
 * read back out of a camera.
 */

// The first character says how the rest was packed, so a code made one way is
// never misread as the other.
const RAW = "0";
const DEFLATED = "1";

// deflate-raw is the smallest of the formats CompressionStream offers — the
// same algorithm as gzip with none of the header or checksum around it.
const FORMAT = "deflate-raw";

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/** Turns a session description into a code fit for a QR or a clipboard. */
export async function encodeSignal(sdp: string): Promise<string> {
  const bytes = new TextEncoder().encode(sdp);
  try {
    const deflated = await drain(
      new Blob([bytes as BlobPart])
        .stream()
        .pipeThrough(new CompressionStream(FORMAT)),
    );
    return DEFLATED + toBase64Url(deflated);
  } catch {
    // An engine without deflate-raw. A bigger code still scans, so pairing
    // stays possible rather than failing outright.
    return RAW + toBase64Url(bytes);
  }
}

/** Reads a code back, whichever way round it reached us. */
export async function decodeSignal(code: string): Promise<string> {
  // A pasted code picks up line breaks and stray spaces on the way; a scanned
  // one never does. Strip them either way rather than guess which this is.
  const clean = code.replace(/\s+/g, "");
  const scheme = clean.slice(0, 1);
  if (scheme !== RAW && scheme !== DEFLATED) {
    throw new Error("That is not a Whot pairing code.");
  }

  let bytes: Uint8Array;
  try {
    bytes = fromBase64Url(clean.slice(1));
  } catch {
    throw new Error("That pairing code is damaged — try reading it again.");
  }
  if (scheme === RAW) return new TextDecoder().decode(bytes);

  try {
    const inflated = await drain(
      new Blob([bytes as BlobPart])
        .stream()
        .pipeThrough(new DecompressionStream(FORMAT)),
    );
    return new TextDecoder().decode(inflated);
  } catch {
    throw new Error("That pairing code is damaged — try reading it again.");
  }
}
