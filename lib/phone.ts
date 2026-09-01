/**
 * Normalize and validate Indonesian phone numbers into standardized E.164 format (+628...).
 * 
 * Handled formats:
 * - 081234567890   -> +6281234567890
 * - 6281234567890  -> +6281234567890
 * - +6281234567890 -> +6281234567890
 * - 0812-3456-7890 -> +6281234567890
 * - +62 812 3456 7890 -> +6281234567890
 */

export function normalizePhoneNumber(phone: string): string {
  if (!phone || typeof phone !== 'string') {
    throw new Error('Phone number must be a non-empty string');
  }

  // Remove whitespace, hyphens, parentheses, and dots
  let cleaned = phone.replace(/[\s\-().]/g, '');

  // Handle leading 0 (e.g. 0812...)
  if (cleaned.startsWith('0')) {
    cleaned = '+62' + cleaned.slice(1);
  } else if (cleaned.startsWith('62')) {
    cleaned = '+' + cleaned;
  } else if (!cleaned.startsWith('+')) {
    cleaned = '+' + cleaned;
  }

  // Validate E.164 pattern: + followed by 10 to 15 digits
  const e164Regex = /^\+[1-9]\d{9,14}$/;
  if (!e164Regex.test(cleaned)) {
    throw new Error(`Invalid phone number format: "${phone}". Expected valid E.164 format (e.g. +6281234567890).`);
  }

  return cleaned;
}

export function isValidPhoneNumber(phone: string): boolean {
  try {
    normalizePhoneNumber(phone);
    return true;
  } catch {
    return false;
  }
}
