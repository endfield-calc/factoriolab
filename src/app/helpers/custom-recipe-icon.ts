export function customRecipeTextColor(background: string): string {
  const hex =
    background.length === 4
      ? background
          .slice(1)
          .split('')
          .map((value) => value + value)
          .join('')
      : background.slice(1);
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  const brightness = red * 299 + green * 587 + blue * 114;
  return brightness >= 160000 ? '#000' : '#fff';
}

export function customRecipeIconDataUri(
  text: string,
  background: string,
): string {
  const color = customRecipeTextColor(background);
  const fontSize = Array.from(text).length > 1 ? 28 : 38;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" fill="${background}"/><text x="32" y="35" fill="${color}" font-family="Arial,sans-serif" font-size="${fontSize.toString()}" font-weight="700" text-anchor="middle" dominant-baseline="middle">${escapeXml(text)}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
