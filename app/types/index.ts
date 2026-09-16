/** One Excel data row, already coerced to plain strings and keyed by column name. */
export type ExcelRow = Record<string, string>

/**
 * A data row together with the line it came from. The two travel as one value
 * because blank rows are skipped while reading: a row's position in this array
 * is NOT its position in the file, and every message the user sees has to name
 * the line they can actually go and look at.
 */
export interface DataRow {
  /** Row number as the user sees it in Excel; the header occupies row 1. */
  excelRow: number
  values: ExcelRow
}

/**
 * Decisions the reader made on the user's behalf. Every one of these is
 * surfaced in the interface: the application must never quietly drop data.
 */
export interface ExcelNotices {
  sheetName: string
  sheetCount: number
  /** Rows whose every mapped cell was empty. */
  skippedEmptyRows: number
  /** Cells Excel stores as real dates, rewritten as gg.aa.yyyy. */
  reformattedDateCells: number
  /**
   * Cells holding a whole number too long for Excel to store exactly. Excel
   * rounded them before this application ever opened the file, so the damage
   * cannot be undone here - only reported.
   */
  roundedNumberCells: number
}

export interface ExcelData {
  fileName: string
  /** Trimmed, de-duplicated column names from the first sheet row. */
  headers: string[]
  rows: DataRow[]
  notices: ExcelNotices
}

/** Template file formats the application can read and write. */
export type TemplateFormat = 'docx' | 'udf'

/**
 * Which delimiter style a template uses. `curly` wins whenever the template
 * contains any {{FIELD}}, because double braces never occur in legal prose -
 * square brackets do, which is the whole reason this choice exists.
 */
export type PlaceholderSyntax = 'square' | 'curly'

/** Things the user has to know about the template they uploaded. */
export interface TemplateNotices {
  /** The template carries an e-signature, which editing necessarily voids. */
  hasSignature: boolean
}

export interface TemplateData {
  fileName: string
  format: TemplateFormat
  syntax: PlaceholderSyntax
  notices: TemplateNotices
  /** Kept so every document can be rendered from a pristine copy of the template. */
  buffer: ArrayBuffer
  /** Unique placeholder names found anywhere in the template. */
  placeholders: string[]
}

/** Placeholders the user marked as ordinary text rather than fields. */
export type IgnoredFields = ReadonlySet<string>

export interface ValidationResult {
  ok: boolean
  placeholderCount: number
  columnCount: number
  rowCount: number
  /** Template placeholders that have a matching Excel column. */
  matched: string[]
  /** Template placeholders with no matching Excel column. Blocks generation. */
  missingFields: string[]
  /** Excel columns the template does not use. Informational only. */
  unusedColumns: string[]
  /** Placeholders the user marked as ordinary text. */
  ignoredFields: string[]
  /** Blocking problems, already written in Turkish. */
  errors: string[]
}

export interface GeneratedDocument {
  fileName: string
  data: Uint8Array
}

/** A row that could not be rendered. Reported, never silently dropped. */
export interface SkippedRow {
  /** Row number as the user sees it in Excel, header included. */
  excelRow: number
  reason: string
}

export interface GenerationResult {
  documents: GeneratedDocument[]
  skipped: SkippedRow[]
}
