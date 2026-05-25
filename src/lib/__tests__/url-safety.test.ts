import { describe, it, expect } from "vitest";
import { isPrivateHostname, isSafePublicUrl } from "@/lib/url-safety";

describe("isPrivateHostname", () => {
  it("blocks loopback literals", () => {
    expect(isPrivateHostname("localhost")).toBe(true);
    expect(isPrivateHostname("ip6-localhost")).toBe(true);
    expect(isPrivateHostname("ip6-loopback")).toBe(true);
  });

  it("blocks private IPv4 ranges", () => {
    expect(isPrivateHostname("127.0.0.1")).toBe(true);
    expect(isPrivateHostname("10.0.0.1")).toBe(true);
    expect(isPrivateHostname("10.255.255.255")).toBe(true);
    expect(isPrivateHostname("192.168.1.1")).toBe(true);
    expect(isPrivateHostname("172.16.0.1")).toBe(true);
    expect(isPrivateHostname("172.20.5.5")).toBe(true);
    expect(isPrivateHostname("172.31.255.255")).toBe(true);
    expect(isPrivateHostname("169.254.169.254")).toBe(true); // AWS/GCP metadata
  });

  it("does not block public IPv4", () => {
    expect(isPrivateHostname("8.8.8.8")).toBe(false);
    expect(isPrivateHostname("172.32.0.1")).toBe(false); // outside private range
    expect(isPrivateHostname("172.15.0.1")).toBe(false);
  });

  it("blocks private IPv6", () => {
    expect(isPrivateHostname("::1")).toBe(true);
    expect(isPrivateHostname("fc00::1")).toBe(true);
    expect(isPrivateHostname("fd12:3456::1")).toBe(true);
    expect(isPrivateHostname("fe80::1")).toBe(true);
  });

  it("does not block public hostnames", () => {
    expect(isPrivateHostname("example.com")).toBe(false);
    expect(isPrivateHostname("api.github.com")).toBe(false);
    expect(isPrivateHostname("hooks.slack.com")).toBe(false);
  });

  it("blocks .internal and .local TLDs", () => {
    expect(isPrivateHostname("internal.local")).toBe(true);
    expect(isPrivateHostname("svc.internal")).toBe(true);
    expect(isPrivateHostname("foo.localhost")).toBe(true);
  });

  it("treats empty hostname as private", () => {
    expect(isPrivateHostname("")).toBe(true);
  });
});

describe("isSafePublicUrl", () => {
  it("accepts plain https public URL", () => {
    const res = isSafePublicUrl("https://example.com/path");
    expect(res.ok).toBe(true);
  });

  it("rejects http by default", () => {
    expect(isSafePublicUrl("http://example.com").ok).toBe(false);
  });

  it("accepts http when allowHttp is true", () => {
    expect(isSafePublicUrl("http://example.com", { allowHttp: true }).ok).toBe(true);
  });

  it("rejects http://localhost", () => {
    expect(isSafePublicUrl("http://localhost", { allowHttp: true }).ok).toBe(false);
  });

  it("rejects ftp scheme", () => {
    expect(isSafePublicUrl("ftp://example.com").ok).toBe(false);
  });

  it("rejects malformed URLs", () => {
    expect(isSafePublicUrl("not a url").ok).toBe(false);
    expect(isSafePublicUrl("").ok).toBe(false);
  });

  it("rejects AWS metadata IP", () => {
    expect(isSafePublicUrl("https://169.254.169.254/latest/meta-data/").ok).toBe(false);
  });

  it("rejects private network IP", () => {
    expect(isSafePublicUrl("https://10.0.0.1").ok).toBe(false);
    expect(isSafePublicUrl("https://192.168.1.1").ok).toBe(false);
  });
});
