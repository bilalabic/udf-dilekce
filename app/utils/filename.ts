import type { ExcelRow } from '~/types'

/** Column used to make filenames recognisable when the Excel file provides one. */
export const NAME_COLUMN = 'AD_SOYAD'

const TURKISH_MAP: Record<string, string> = {
  ç: 'c', Ç: 'C',
  ğ: 'g', Ğ: 'G',
  ı: 'i', İ: 'I',
  ö: 'o', Ö: 'O',
  ş: 's', Ş: 'S',
  ü: 'u', Ü: 'U'
}

const MAX_LABEL_LENGTH = 60

/**
 * Turkish letters are transliterated rather than preserved: ZIP entries with
 * non-ASCII names are still mangled by several Windows and macOS extractors,
 * and a mangled filename is worse than an ASCII one. The final whitelist also
 * removes control characters and anything reserved by a major filesystem.
 */
export function sanitize(value: string): string {
  return value
    .replace(/[çÇğĞıİöÖşŞüÜ]/g, (char) => TURKISH_MAP[char] ?? char)
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9._-]/g, '')
    .replace(/_+/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, MAX_LABEL_LENGTH)
}

export function buildDocumentName(index: number, row: ExcelRow, extension = '.docx'): string {
  const sequence = String(index + 1).padStart(3, '0')
  const label = sanitize(row[NAME_COLUMN] ?? '')

  return label ? `Dilekce_${sequence}_${label}${extension}` : `Dilekce_${sequence}${extension}`
}

/** Guarantees unique entries inside the archive when two rows produce one name. */
export function makeUnique(name: string, taken: Set<string>): string {
  if (!taken.has(name)) {
    taken.add(name)
    return name
  }

  const dot = name.lastIndexOf('.')
  const base = dot === -1 ? name : name.slice(0, dot)
  const extension = dot === -1 ? '' : name.slice(dot)

  let counter = 2
  while (taken.has(`${base}_${counter}${extension}`)) counter += 1

  const candidate = `${base}_${counter}${extension}`
  taken.add(candidate)
  return candidate
}
