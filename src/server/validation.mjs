import { HttpError } from './http.mjs';

export function requiredText(value, label, max = 5000) {
  const text = String(value || '').trim();
  if (!text) throw new HttpError(400, `${label} is required.`);
  if (text.length > max) throw new HttpError(400, `${label} is too long.`);
  return text;
}

export function httpUrl(value, label = 'Link') {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    return url.toString();
  } catch {
    throw new HttpError(400, `Enter a valid http or https ${label.toLowerCase()}.`);
  }
}

export function emailAddress(value, label = 'Email address') {
  const email = requiredText(value, label, 200).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, `Enter a valid ${label.toLowerCase()}.`);
  return email;
}
