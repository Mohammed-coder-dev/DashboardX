// Turning a file's bytes into text, once, in one place.
//
// A byte-order mark is an encoding signature, not content. Excel's
// "CSV UTF-8 (Comma delimited)" export always writes one, so this is the shape
// a large share of real spreadsheets arrive in — and left in place the mark
// becomes the first character of the first column's name. The parsed key is
// then `\uFEFFid` while the header the reader sees says `id`, so every boundary
// that matches on a column name — the target column, a column selection, a
// drill-down — rejects the name they read off their own screen as unknown. In a
// `.json` file it is worse than cosmetic: `JSON.parse` rejects a leading mark
// outright, so the file failed to parse at all.
//
// Only a *leading* mark is a signature. The same code point later in the file
// is data and is left exactly where it is.
const UTF8_BOM = [0xef, 0xbb, 0xbf];
const UTF16LE_BOM = [0xff, 0xfe];
const UTF16BE_BOM = [0xfe, 0xff];

function startsWith(buffer, bytes) {
  if (buffer.length < bytes.length) return false;
  return bytes.every((byte, index) => buffer[index] === byte);
}

/**
 * Decode a file buffer to a string, honouring a leading byte-order mark.
 *
 * UTF-16 is decoded rather than mangled: Excel's "Unicode Text" export writes
 * UTF-16LE, and reading those bytes as UTF-8 produces a column of mojibake
 * instead of an error, which is the failure mode that never gets reported.
 * Without a mark, UTF-8 is assumed — which is what this parser always did.
 */
export function decodeText(buffer) {
  if (startsWith(buffer, UTF16LE_BOM)) return buffer.subarray(2).toString("utf16le");
  if (startsWith(buffer, UTF16BE_BOM)) return buffer.subarray(2).swap16().toString("utf16le");
  if (startsWith(buffer, UTF8_BOM)) return buffer.subarray(3).toString("utf-8");
  return buffer.toString("utf-8");
}
