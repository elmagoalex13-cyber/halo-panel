import crypto from "node:crypto";

function getVaultKey() {
  const value = process.env.VAULT_MASTER_KEY;
  if (!value || value.length < 32) {
    throw new Error("VAULT_MASTER_KEY must be at least 32 characters");
  }

  return crypto.createHash("sha256").update(value).digest();
}

export function encryptVaultValue(plainText: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getVaultKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    encrypted_blob: Buffer.concat([encrypted, tag]).toString("base64"),
    iv: iv.toString("base64"),
  };
}

export function decryptVaultValue(encryptedBlob: string, ivValue: string) {
  const payload = Buffer.from(encryptedBlob, "base64");
  const iv = Buffer.from(ivValue, "base64");
  const tag = payload.subarray(payload.length - 16);
  const encrypted = payload.subarray(0, payload.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", getVaultKey(), iv);

  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
