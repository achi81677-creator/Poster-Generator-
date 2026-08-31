import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = path.join(process.cwd(), ".cache");

function dir(sub: string): string {
  const d = path.join(ROOT, sub);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function keyToFile(key: string): string {
  return crypto.createHash("sha1").update(key).digest("hex");
}

export function readJson<T>(sub: string, key: string): T | null {
  const f = path.join(dir(sub), keyToFile(key) + ".json");
  try {
    return JSON.parse(fs.readFileSync(f, "utf8")) as T;
  } catch {
    return null;
  }
}

export function writeJson(sub: string, key: string, value: unknown): void {
  const f = path.join(dir(sub), keyToFile(key) + ".json");
  fs.writeFileSync(f, JSON.stringify(value));
}

export function readBuffer(sub: string, key: string): Buffer | null {
  const f = path.join(dir(sub), keyToFile(key) + ".bin");
  try {
    return fs.readFileSync(f);
  } catch {
    return null;
  }
}

export function writeBuffer(sub: string, key: string, value: Buffer): void {
  const f = path.join(dir(sub), keyToFile(key) + ".bin");
  fs.writeFileSync(f, value);
}
