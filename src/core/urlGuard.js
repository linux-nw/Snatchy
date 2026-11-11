"use strict";
/**
 * Prueft Eingabe-URLs: nur http und https, kein fuehrendes "-" (sonst koennte
 * yt-dlp die Eingabe als Option lesen), keine Steuerzeichen.
 * Gibt die getrimmte URL zurueck oder null.
 */
const normalizeHttpUrl = (input) => {
  if (typeof input !== "string") return null;
  const text = input.trim();
  if (!text || text.startsWith("-") || /[\u0000-\u001f\u007f]/.test(text)) return null;
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    return null;
  }
  return parsed.protocol === "http:" || parsed.protocol === "https:" ? text : null;
};

module.exports = { normalizeHttpUrl };
