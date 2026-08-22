import crypto from 'crypto';

const ITERATIONS = 100000;
const KEY_LEN = 64; // 64 bytes = 512 bits
const DIGEST = 'sha512';

/**
 * Hashes a plaintext password using PBKDF2 with SHA-512 and a cryptographically secure random salt.
 * Result format: pbkdf2$<iterations>$<saltHex>$<hashHex>
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LEN, DIGEST);
  const hash = derivedKey.toString('hex');
  return `pbkdf2$${ITERATIONS}$${salt}$${hash}`;
}

/**
 * Verifies a plaintext password against a stored hashed or legacy password.
 * Supports timing-safe equality check.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  if (!password || !storedHash) {
    return false;
  }

  // If password stored in PBKDF2 format
  if (storedHash.startsWith('pbkdf2$')) {
    try {
      const parts = storedHash.split('$');
      if (parts.length !== 4) {
        return false;
      }
      const iterations = parseInt(parts[1], 10);
      const salt = parts[2];
      const originalHash = parts[3];

      if (isNaN(iterations) || !salt || !originalHash) {
        return false;
      }

      const derivedKey = crypto.pbkdf2Sync(password, salt, iterations, Buffer.from(originalHash, 'hex').length, DIGEST);
      const hashBuffer = Buffer.from(originalHash, 'hex');

      if (derivedKey.length !== hashBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(derivedKey, hashBuffer);
    } catch {
      return false;
    }
  }

  // Legacy fallback for plain text comparison (auto-migrated on verification/initialization)
  try {
    const a = Buffer.from(password);
    const b = Buffer.from(storedHash);
    if (a.length !== b.length) {
      return false;
    }
    return crypto.timingSafeEqual(a, b);
  } catch {
    return password === storedHash;
  }
}

/**
 * Checks whether a given string is already hashed with PBKDF2
 */
export function isHashed(storedHash: string): boolean {
  return typeof storedHash === 'string' && storedHash.startsWith('pbkdf2$');
}
