import readXlsxFile, { readSheetNames } from 'read-excel-file'
import type { ExcelData, ExcelNotices, ExcelRow } from '~/types'
import { AppError } from '~/utils/errors'

type RawCell = string | number | boolean | Date | null | undefined

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/**
 * Fallback for cells Excel stores as real dates. Plain-text date columns are
 * passed through untouched; only true date cells reach this function.
 * UTC getters are used because the parser builds dates at UTC midnight.
 */
function formatDate(value: Date): string {
  return `${pad(value.getUTCDate())}.${pad(value.getUTCMonth() + 1)}.${value.getUTCFullYear()}`
}

export function cellToString(value: RawCell): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  // String() keeps identifiers such as an 11-digit TC kimlik intact; JavaScript
  // only switches to exponent notation above 1e21.
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  if (typeof value === 'boolean') return value ? 'Evet' : 'Hayır'
  if (value instanceof Date) return formatDate(value)
  return String(value)
}

export function normaliseHeaders(rawHeaders: RawCell[]): string[] {
  const headers = rawHeaders.map(cellToString)

  // Trailing blank columns are common in hand-edited sheets; drop them.
  while (headers.length > 0 && headers[headers.length - 1] === '') headers.pop()

  if (headers.every((header) => header === '')) {
    throw new AppError('EXCEL_NO_HEADERS', 'Excel dosyasının ilk satırında sütun adı bulunamadı.')
  }

  const seen = new Set<string>()
  for (const header of headers) {
    if (header === '') continue
    if (seen.has(header)) {
      throw new AppError(
        'EXCEL_DUPLICATE_HEADER',
        `Excel dosyasında aynı sütun adı birden fazla kez kullanılmış: ${header}`
      )
    }
    seen.add(header)
  }

  return headers
}

export interface RowsResult {
  rows: ExcelRow[]
  skippedEmptyRows: number
  reformattedDateCells: number
}

export function buildRows(headers: string[], rawRows: RawCell[][]): RowsResult {
  const rows: ExcelRow[] = []
  let skippedEmptyRows = 0
  let reformattedDateCells = 0

  for (const rawRow of rawRows) {
    const row: ExcelRow = {}
    let hasValue = false

    headers.forEach((header, index) => {
      if (header === '') return // unnamed column: not addressable from the template
      const raw = rawRow[index]
      // Counted so the interface can say a date was rewritten, rather than
      // quietly changing what the user typed.
      if (raw instanceof Date) reformattedDateCells += 1

      const value = cellToString(raw)
      row[header] = value
      if (value !== '') hasValue = true
    })

    if (hasValue) rows.push(row)
    else skippedEmptyRows += 1
  }

  return { rows, skippedEmptyRows, reformattedDateCells }
}

export function parseRows(
  fileName: string,
  rawRows: RawCell[][],
  sheet: { name: string; count: number } = { name: 'Sayfa 1', count: 1 }
): ExcelData {
  if (rawRows.length === 0) {
    throw new AppError('EXCEL_EMPTY', 'Excel dosyası boş.')
  }

  const headers = normaliseHeaders(rawRows[0] ?? [])
  const { rows, skippedEmptyRows, reformattedDateCells } = buildRows(headers, rawRows.slice(1))

  const notices: ExcelNotices = {
    sheetName: sheet.name,
    sheetCount: sheet.count,
    skippedEmptyRows,
    reformattedDateCells
  }

  return {
    fileName,
    headers: headers.filter((header) => header !== ''),
    rows,
    notices
  }
}

export async function readExcel(file: File): Promise<ExcelData> {
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    throw new AppError(
      'EXCEL_WRONG_EXTENSION',
      'Yalnızca .xlsx uzantılı Excel dosyaları desteklenir.',
      'Eski .xls dosyalarını Excel’de “Farklı Kaydet → .xlsx” ile dönüştürebilirsiniz.'
    )
  }

  let rawRows: RawCell[][]
  let sheetNames: string[] = []
  try {
    // Which sheet was used must be visible: a workbook often has several.
    sheetNames = await readSheetNames(file)
    rawRows = (await readXlsxFile(file, { trim: true })) as unknown as RawCell[][]
  } catch (error) {
    throw new AppError(
      'EXCEL_UNREADABLE',
      'Excel dosyası okunamadı. Dosya bozuk olabilir veya geçerli bir .xlsx olmayabilir.',
      error instanceof Error ? error.message : undefined
    )
  }

  return parseRows(file.name, rawRows, {
    name: sheetNames[0] ?? 'Sayfa 1',
    count: sheetNames.length || 1
  })
}
