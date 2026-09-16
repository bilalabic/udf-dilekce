import readXlsxFile, { readSheetNames } from 'read-excel-file'
import type { DataRow, ExcelData, ExcelNotices, ExcelRow } from '~/types'
import { AppError } from '~/utils/errors'

type RawCell = string | number | boolean | Date | null | undefined

/**
 * The header occupies row 1, so the first data row is row 2. Row numbers are
 * computed from a row's position in the FILE, never from its position in the
 * array this module returns: a blank row in the middle of a sheet is skipped
 * but still uses up a row number, and the reader keeps blank rows in place
 * (it only trims at the end), so the two counts drift apart the moment a user
 * leaves a gap in their list.
 */
const FIRST_DATA_ROW = 2

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

/**
 * A whole number Excel could not store exactly - more than 15 significant
 * digits, such as an IBAN typed into a number cell. The rounding happened in
 * Excel, long before this file was opened here, so the original digits are
 * unrecoverable and the only honest thing left to do is say so.
 */
function isRoundedNumber(value: RawCell): boolean {
  return typeof value === 'number' && Number.isInteger(value) && !Number.isSafeInteger(value)
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
  rows: DataRow[]
  skippedEmptyRows: number
  reformattedDateCells: number
  roundedNumberCells: number
}

/**
 * Turns the rows below the header into data rows. `rawRows` must start at the
 * first data row, because each row's number is derived from its index here.
 */
export function buildRows(headers: string[], rawRows: RawCell[][]): RowsResult {
  const rows: DataRow[] = []
  let skippedEmptyRows = 0
  let reformattedDateCells = 0
  let roundedNumberCells = 0

  rawRows.forEach((rawRow, rawIndex) => {
    const values: ExcelRow = {}
    let hasValue = false

    headers.forEach((header, index) => {
      if (header === '') return // unnamed column: not addressable from the template
      const raw = rawRow[index]
      // Counted so the interface can say a date was rewritten, rather than
      // quietly changing what the user typed.
      if (raw instanceof Date) reformattedDateCells += 1
      if (isRoundedNumber(raw)) roundedNumberCells += 1

      const value = cellToString(raw)
      values[header] = value
      if (value !== '') hasValue = true
    })

    // The row keeps the number it has in the file, so a later error message
    // points at the line the user can actually open and fix.
    if (hasValue) rows.push({ excelRow: rawIndex + FIRST_DATA_ROW, values })
    else skippedEmptyRows += 1
  })

  return { rows, skippedEmptyRows, reformattedDateCells, roundedNumberCells }
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
  const { rows, skippedEmptyRows, reformattedDateCells, roundedNumberCells } = buildRows(
    headers,
    rawRows.slice(1)
  )

  const notices: ExcelNotices = {
    sheetName: sheet.name,
    sheetCount: sheet.count,
    skippedEmptyRows,
    reformattedDateCells,
    roundedNumberCells
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
