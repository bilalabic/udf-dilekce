import type {
  ExcelData,
  GeneratedDocument,
  GenerationResult,
  IgnoredFields,
  SkippedRow,
  TemplateData
} from '~/types'
import { AppError } from '~/utils/errors'
import { extensionFor, renderTemplate } from '~/utils/template'
import { buildDocumentName, makeUnique } from '~/utils/filename'

export interface GenerateOptions {
  onProgress?: (completed: number, total: number) => void
  /** Documents rendered between two event-loop yields. */
  chunkSize?: number
  /** Placeholders to leave in the document as ordinary text. */
  ignoredFields?: IgnoredFields
  /** Lets the user stop a long batch; already-built documents are kept. */
  signal?: AbortSignal
}

/** Hands control back to the browser so the progress bar can repaint. */
function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * Excel row number as the user sees it: the header occupies row 1, so the
 * first data row is row 2. Error messages must match what is on their screen.
 */
function excelRowNumber(index: number): number {
  return index + 2
}

export async function generateDocuments(
  template: TemplateData,
  excel: ExcelData,
  options: GenerateOptions = {}
): Promise<GenerationResult> {
  const { onProgress, chunkSize = 10, ignoredFields, signal } = options
  const documents: GeneratedDocument[] = []
  const skipped: SkippedRow[] = []
  const takenNames = new Set<string>()
  const total = excel.rows.length
  const extension = extensionFor(template.format)

  for (let index = 0; index < total; index += 1) {
    if (signal?.aborted) {
      throw new AppError(
        'GENERATION_CANCELLED',
        'Belge oluşturma iptal edildi.',
        `${documents.length} belge hazırlanmıştı, hiçbiri kaydedilmedi.`
      )
    }

    const row = excel.rows[index]!

    try {
      documents.push({
        fileName: makeUnique(buildDocumentName(index, row, extension), takenNames),
        data: renderTemplate(template, row, ignoredFields)
      })
    } catch (error) {
      // One bad row must not destroy the work done for every other row. The
      // row is recorded and reported instead - never dropped in silence.
      skipped.push({
        excelRow: excelRowNumber(index),
        reason: error instanceof AppError ? error.detail ?? error.message : String(error)
      })
    }

    onProgress?.(index + 1, total)
    if ((index + 1) % chunkSize === 0) await yieldToBrowser()
  }

  if (documents.length === 0 && skipped.length > 0) {
    throw new AppError(
      'RENDER_FAILED',
      'Hiçbir belge oluşturulamadı.',
      `${skipped.length} satırın tamamı hata verdi. İlk hata: ${skipped[0]!.reason}`
    )
  }

  return { documents, skipped }
}

/**
 * The report that travels inside the ZIP. Without it, a user who opens the
 * archive days later has no way of knowing that rows are missing.
 */
export function buildReport(
  template: TemplateData,
  excel: ExcelData,
  result: GenerationResult
): string {
  const now = new Date()
  const stamp = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`

  const lines = [
    'TOPLU DILEKCE OLUSTURUCU - URETIM RAPORU',
    `Tarih            : ${stamp}`,
    `Sablon           : ${template.fileName}`,
    `Excel            : ${excel.fileName}`,
    `Okunan sayfa     : ${excel.notices.sheetName}`,
    '',
    `Excel veri satiri: ${excel.rows.length}`,
    `Uretilen belge   : ${result.documents.length}`,
    `Atlanan satir    : ${result.skipped.length}`
  ]

  if (excel.notices.skippedEmptyRows > 0) {
    lines.push(`Bos satir        : ${excel.notices.skippedEmptyRows} (okunurken atlandi)`)
  }

  if (result.skipped.length > 0) {
    lines.push('', 'ATLANAN SATIRLAR', '-'.repeat(40))
    for (const row of result.skipped) {
      lines.push(`Excel satir ${row.excelRow}: ${row.reason}`)
    }
    lines.push('', 'Bu satirlar icin belge URETILMEDI. Duzeltip tekrar calistirin.')
  }

  return lines.join('\r\n')
}
