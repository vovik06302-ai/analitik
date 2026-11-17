import crypto from 'crypto';

/**
 * In-memory AES-256-GCM vault for server-side API credentials.
 * Ensures the raw GEMINI_API_KEY is not kept as a plaintext string in process.env
 * or accidentally serialized in diagnostics/logs.
 */
class ServerKeyVault {
  private readonly masterKey: Buffer;
  private sealedGeminiKey: { iv: Buffer; tag: Buffer; ciphertext: Buffer } | null = null;

  constructor() {
    this.masterKey = crypto.randomBytes(32);
    this.sealFromEnv();
  }

  private sealFromEnv(): void {
    const raw = process.env.GEMINI_API_KEY?.trim();
    if (!raw) return;

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.masterKey, iv);
    const ciphertext = Buffer.concat([cipher.update(raw, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    this.sealedGeminiKey = { iv, tag, ciphertext };
    delete process.env.GEMINI_API_KEY;
  }

  public hasGeminiKey(): boolean {
    if (!this.sealedGeminiKey && process.env.GEMINI_API_KEY?.trim()) {
      this.sealFromEnv();
    }
    return this.sealedGeminiKey !== null;
  }

  public decryptGeminiKey(): string | null {
    if (!this.sealedGeminiKey) {
      this.sealFromEnv();
    }
    if (!this.sealedGeminiKey) return null;

    const { iv, tag, ciphertext } = this.sealedGeminiKey;
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.masterKey, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  }
}

export const keyVault = new ServerKeyVault();
