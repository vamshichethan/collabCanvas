export const sanitizeMessage = (message: unknown, maxLength: number) =>
  String(message ?? '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, maxLength);
