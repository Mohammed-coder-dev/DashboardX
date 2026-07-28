import { describe, it, expect } from "vitest";
import { isPrivateAddress, assertSafeUrl, remoteFilename } from "../src/services/remoteFile.js";

describe("isPrivateAddress", () => {
  it("flags private and special IPv4 ranges", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.0.1", "169.254.169.254", "0.0.0.0",
                      "100.64.0.1", "100.127.255.255", "192.0.0.8", "192.0.2.1", "198.18.0.1", "198.51.100.7",
                      "203.0.113.9", "224.0.0.1", "240.0.0.1", "255.255.255.255"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });

  it("allows public IPv4 addresses", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "172.15.0.1", "192.169.0.1", "100.63.0.1", "100.128.0.1", "198.17.0.1", "223.255.255.1"]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });

  it("flags IPv6 loopback, ULA, link-local, and mapped-private addresses", () => {
    for (const ip of ["::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "fe9f::1", "feb0::1", "::ffff:192.168.1.1",
                      "ff02::1", "2001:db8::1", "64:ff9b::808:808"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });

  it("rejects non-mapped embedded-IPv4 forms outright", () => {
    expect(isPrivateAddress("::8.8.8.8")).toBe(true);
    expect(isPrivateAddress("64:ff9b::8.8.8.8")).toBe(true);
  });

  it("allows public IPv6 and mapped-public addresses", () => {
    expect(isPrivateAddress("2606:4700::1111")).toBe(false);
    expect(isPrivateAddress("::ffff:8.8.8.8")).toBe(false);
  });

  it("treats unparseable input as unsafe", () => {
    expect(isPrivateAddress("not-an-ip")).toBe(true);
  });
});

describe("assertSafeUrl", () => {
  it("accepts a normal https URL", () => {
    expect(assertSafeUrl("https://example.com/data.csv").hostname).toBe("example.com");
  });

  it.each([
    ["http://example.com/a.csv", "unsupported_protocol"],
    ["ftp://example.com/a.csv", "unsupported_protocol"],
    ["file:///etc/passwd", "unsupported_protocol"],
    ["https://user:pass@example.com/a.csv", "invalid_url"],
    ["not a url at all", "invalid_url"],
    ["https://localhost/a.csv", "private_host"],
    ["https://foo.localhost/a.csv", "private_host"],
    ["https://db.internal/a.csv", "private_host"],
    ["https://printer.local/a.csv", "private_host"],
    ["https://127.0.0.1/a.csv", "private_host"],
    ["https://10.0.0.1/a.csv", "private_host"],
    ["https://[::1]/a.csv", "private_host"],
  ])("rejects %s with %s", (url, code) => {
    expect(() => assertSafeUrl(url)).toThrowError(expect.objectContaining({ code }));
  });
});

describe("remoteFilename", () => {
  it("takes the filename from the URL path", () => {
    expect(remoteFilename(new URL("https://x.com/reports/q3%20final.xlsx"), null)).toBe("q3 final.xlsx");
  });

  it("prefers the content-disposition filename", () => {
    expect(remoteFilename(new URL("https://x.com/download"), 'attachment; filename="export.csv"')).toBe("export.csv");
  });

  it("parses RFC 5987 encoded filenames", () => {
    expect(remoteFilename(new URL("https://x.com/dl"), "attachment; filename*=UTF-8''r%C3%A9sum%C3%A9.pdf")).toBe("résumé.pdf");
  });

  it("strips directory components from hostile names", () => {
    expect(remoteFilename(new URL("https://x.com/dl"), 'attachment; filename="..\\..\\evil.csv"')).toBe("evil.csv");
  });

  it("rejects unsupported extensions", () => {
    expect(() => remoteFilename(new URL("https://x.com/malware.exe"), null))
      .toThrowError(expect.objectContaining({ code: "unsupported_file_type" }));
  });

  it("rejects URLs with no usable filename", () => {
    expect(() => remoteFilename(new URL("https://x.com/"), null))
      .toThrowError(expect.objectContaining({ code: "unsupported_file_type" }));
  });
});
