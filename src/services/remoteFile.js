import net from "net";
import path from "path";
import dns from "dns/promises";
import { AppError } from "../errors.js";
import { ALLOWED_EXTENSIONS } from "../parsers/index.js";

const MAX_BYTES     = 25 * 1024 * 1024;
const FETCH_TIMEOUT = 20_000;
const MAX_REDIRECTS = 3;

export function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a === 169 && b === 254 ||
           a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower.startsWith("::ffff:")) return isPrivateAddress(lower.slice(7));
    return lower === "::1" || lower === "::" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80");
  }
  return true;
}

export function assertSafeUrl(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl));
  } catch {
    throw new AppError("That is not a valid URL.", { status: 400, code: "invalid_url" });
  }
  if (url.protocol !== "https:") {
    throw new AppError("Only https:// URLs are supported.", { status: 400, code: "unsupported_protocol" });
  }
  if (url.username || url.password) {
    throw new AppError("URLs with embedded credentials are not supported.", { status: 400, code: "invalid_url" });
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new AppError("That URL points to a private host.", { status: 400, code: "private_host" });
  }
  if (net.isIP(host) && isPrivateAddress(host)) {
    throw new AppError("That URL points to a private address.", { status: 400, code: "private_host" });
  }
  return url;
}

async function assertPublicDns(hostname) {
  if (net.isIP(hostname)) return;
  let records;
  try {
    records = await dns.lookup(hostname, { all: true });
  } catch {
    throw new AppError("Could not resolve that host.", { status: 400, code: "dns_failed" });
  }
  if (records.length === 0 || records.some(r => isPrivateAddress(r.address))) {
    throw new AppError("That URL points to a private address.", { status: 400, code: "private_host" });
  }
}

export function remoteFilename(url, contentDisposition) {
  let name = "";
  const match = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(contentDisposition || "");
  if (match) {
    try { name = decodeURIComponent(match[1].trim()); } catch { name = match[1].trim(); }
  }
  if (!name) {
    try { name = decodeURIComponent(path.posix.basename(url.pathname)); } catch { name = path.posix.basename(url.pathname); }
  }
  name = path.basename(name);
  const ext = path.extname(name).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new AppError(
      `The URL must point to a supported file type (${ALLOWED_EXTENSIONS.join(", ")}).`,
      { status: 400, code: "unsupported_file_type" },
    );
  }
  return name;
}

async function readCapped(response) {
  const declared = Number(response.headers.get("content-length"));
  if (declared > MAX_BYTES) {
    throw new AppError("Remote file exceeds the 25 MB limit.", { status: 413, code: "file_too_large" });
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new AppError("Remote file exceeds the 25 MB limit.", { status: 413, code: "file_too_large" });
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

// Redirects are followed manually so every hop is re-validated against the
// private-host rules — automatic following would let a public URL bounce
// the server into internal addresses.
export async function fetchRemoteFile(rawUrl) {
  let url = assertSafeUrl(rawUrl);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicDns(url.hostname);

    let response;
    try {
      response = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
        headers: { "User-Agent": "DashboardX/2.0 (+https://github.com/MohammedAlkindi/DashboardX)" },
      });
    } catch (err) {
      const timedOut = err?.name === "TimeoutError" || err?.name === "AbortError";
      throw new AppError(
        timedOut ? "Fetching the URL timed out." : "Could not fetch that URL.",
        { status: 502, code: timedOut ? "fetch_timeout" : "fetch_failed" },
      );
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || hop === MAX_REDIRECTS) {
        throw new AppError("Too many redirects.", { status: 400, code: "too_many_redirects" });
      }
      url = assertSafeUrl(new URL(location, url).href);
      continue;
    }

    if (!response.ok) {
      throw new AppError(`The URL returned HTTP ${response.status}.`, { status: 502, code: "fetch_failed" });
    }

    const originalname = remoteFilename(url, response.headers.get("content-disposition"));
    const buffer = await readCapped(response);
    if (buffer.length === 0) {
      throw new AppError("The URL returned an empty file.", { status: 400, code: "empty_file" });
    }
    return { buffer, originalname, size: buffer.length, sourceUrl: url.href };
  }

  throw new AppError("Too many redirects.", { status: 400, code: "too_many_redirects" });
}
