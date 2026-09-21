import { Transform } from "node:stream";
import type { TransformCallback } from "node:stream";

/**
 * Validación por firma de contenido (magic bytes) al subir archivos: verifica
 * que los primeros bytes del archivo correspondan a su extensión declarada.
 * Solo mitiga envíos torpes/erróneos; con acceso admin-only no es un límite
 * de seguridad fuerte, pero evita servir un PDF disfrazado de .png, etc.
 */

export const MAGIC_PEEK_BYTES = 64;

export class FileTypeMismatchError extends Error {
  constructor(expectedExt: string, actual: string) {
    super(`El tipo real del archivo (${actual}) no coincide con su extensión (.${expectedExt || "sin extensión"}).`);
    this.name = "FileTypeMismatchError";
  }
}

function hasSignature(data: Uint8Array, sig: number[]): boolean {
  if (data.length < sig.length) return false;
  for (let i = 0; i < sig.length; i++) if (data[i] !== sig[i]) return false;
  return true;
}

/** "<atom-size>ftyp" (MP4/MOV). El tamaño no se valida, solo la marca. */
function isFtyp(data: Uint8Array): boolean {
  return data.length >= 8 && hasSignature(data.subarray(4, 8), [0x66, 0x74, 0x79, 0x70]);
}

/** "RIFF<size><tag>" (AVI/WAVE/WEBP). */
function isRiff(data: Uint8Array, tag: string): boolean {
  const sig = [...tag].map((c) => c.charCodeAt(0));
  return (
    data.length >= 12 &&
    hasSignature(data, [0x52, 0x49, 0x46, 0x46]) &&
    hasSignature(data.subarray(8, 12), sig)
  );
}

type Kind =
  | "pdf"
  | "zip"
  | "ole"
  | "rar"
  | "7z"
  | "mp4-mov"
  | "webm"
  | "avi"
  | "mp3"
  | "wav"
  | "ogg"
  | "jpg"
  | "png"
  | "gif"
  | "webp"
  | "xml-text"
  | "plain-text"
  | "unknown";

export function detectKind(data: Uint8Array): Kind {
  if (data.length === 0) return "unknown";
  // PDF
  if (hasSignature(data, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf";
  // ZIP (incl. docx/xlsx: son ZIP)
  if (
    hasSignature(data, [0x50, 0x4b, 0x03, 0x04]) ||
    hasSignature(data, [0x50, 0x4b, 0x05, 0x06]) ||
    hasSignature(data, [0x50, 0x4b, 0x07, 0x08])
  ) {
    return "zip";
  }
  // OLE (doc/xls legacy)
  if (hasSignature(data, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return "ole";
  // RAR y 7Z
  if (hasSignature(data, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07])) return "rar";
  if (hasSignature(data, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) return "7z";
  // Video / audio
  if (isFtyp(data)) return "mp4-mov";
  if (hasSignature(data, [0x1a, 0x45, 0xdf, 0xa3])) return "webm";
  if (isRiff(data, "AVI ")) return "avi";
  if (hasSignature(data, [0x49, 0x44, 0x33])) return "mp3";
  if (isRiff(data, "WAVE")) return "wav";
  if (hasSignature(data, [0x4f, 0x67, 0x67, 0x53])) return "ogg";
  // Imágenes
  if (hasSignature(data, [0xff, 0xd8, 0xff])) return "jpg";
  if (hasSignature(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (
    hasSignature(data, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
    hasSignature(data, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
  ) {
    return "gif";
  }
  if (isRiff(data, "WEBP")) return "webp";
  // Texto: salta espacios/BOM UTF-8 y mira si arranca con '<'.
  let i = 0;
  while (
    i < data.length &&
    (data[i] === 0x20 || data[i] === 0x09 || data[i] === 0x0d || data[i] === 0x0a || data[i] === 0xef)
  ) {
    i += 1;
  }
  if (i < data.length && data[i] === 0x3c) return "xml-text";
  return "unknown";
}

/** Extensiones que admiten cualquier contenido (no hay firma que validar). */
const TEXT_EXT = new Set(["txt", "md"]);

const ALLOWED_KINDS: Record<string, readonly Kind[]> = {
  pdf: ["pdf"],
  zip: ["zip"],
  docx: ["zip"],
  xlsx: ["zip"],
  doc: ["ole"],
  xls: ["ole"],
  rar: ["rar"],
  "7z": ["7z"],
  mp4: ["mp4-mov"],
  mov: ["mp4-mov"],
  webm: ["webm"],
  avi: ["avi"],
  mp3: ["mp3"],
  wav: ["wav"],
  ogg: ["ogg"],
  jpg: ["jpg"],
  jpeg: ["jpg"],
  png: ["png"],
  gif: ["gif"],
  webp: ["webp"],
  svg: ["xml-text"],
  txt: ["plain-text"],
  md: ["plain-text"],
};

export function validateFileType(
  peek: Uint8Array,
  ext: string,
): { ok: true } | { ok: false; detected: string } {
  const allowed = ALLOWED_KINDS[ext];
  // Extensión sin firma conocida: no se puede validar, se acepta.
  if (!allowed) return { ok: true };
  // Texto vacío (ej. .txt/.md) se acepta.
  if (TEXT_EXT.has(ext) && peek.length === 0) return { ok: true };

  const detected = detectKind(peek);
  if (allowed.includes(detected)) return { ok: true };
  if (detected === "unknown") return { ok: false, detected: "tipo no reconocido" };
  if (detected === "plain-text") return { ok: false, detected: "archivo de texto plano" };
  if (detected === "xml-text") return { ok: false, detected: "documento XML/texto" };
  return { ok: false, detected: `formato .${detected === "mp4-mov" ? "mp4/mov" : detected}` };
}

/** Transform en streaming que inspecciona el inicio del flujo y aborta con
 *  FileTypeMismatchError si la firma no coincide. No carga el archivo en
 *  memoria: solo retiene los primeros MAGIC_PEEK_BYTES. */
export function createFileTypeSniff(expectedExt: string): Transform {
  class SniffTransform extends Transform {
    private peek: Buffer = Buffer.alloc(0);

    _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback) {
      this.peek = this.peek.byteLength >= MAGIC_PEEK_BYTES
        ? this.peek
        : Buffer.concat([this.peek, chunk]).subarray(0, MAGIC_PEEK_BYTES);
      if (this.peek.byteLength >= MAGIC_PEEK_BYTES) {
        const result = validateFileType(this.peek, expectedExt);
        if (!result.ok) {
          callback(new FileTypeMismatchError(expectedExt, result.detected));
          return;
        }
      }
      callback(null, chunk);
    }

    _flush(callback: TransformCallback) {
      const result = validateFileType(this.peek, expectedExt);
      if (!result.ok) {
        callback(new FileTypeMismatchError(expectedExt, result.detected));
        return;
      }
      callback();
    }
  }

  return new SniffTransform();
}