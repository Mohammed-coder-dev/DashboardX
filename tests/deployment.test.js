import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("container deployment contract", () => {
  it("runs the production image without root and with a health check", async () => {
    const dockerfile = await readFile(new URL("../Dockerfile", import.meta.url), "utf8");
    expect(dockerfile).toContain("npm ci --omit=dev");
    expect(dockerfile).toContain("USER node");
    expect(dockerfile).toContain("HEALTHCHECK");
    expect(dockerfile).toContain("/api/health");
    expect(dockerfile).not.toMatch(/COPY .*\.env/);
  });

  it("keeps secrets and development artifacts out of the build context", async () => {
    const ignored = await readFile(new URL("../.dockerignore", import.meta.url), "utf8");
    expect(ignored).toMatch(/^\.env$/m);
    expect(ignored).toMatch(/^\.env\.\*$/m);
    expect(ignored).toMatch(/^node_modules$/m);
    expect(ignored).toMatch(/^\.git$/m);
  });
});
