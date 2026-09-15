import type { ExcelRow, IgnoredFields, TemplateData, TemplateFormat } from '~/types'
import { AppError } from '~/utils/errors'
import { inspectDocxBuffer, renderDocx } from '~/utils/docx'
import { inspectUdfBuffer, renderUdf } from '~/utils/udf'

/**
 * Single place that knows which engine handles which file type. Generated
 * documents always keep the template's own format: a DOCX template yields
 * .docx files and a UDF template yields .udf files, so nothing is ever
 * converted between the two and no formatting is lost in translation.
 */

export const TEMPLATE_FORMATS: Record<TemplateFormat, { extension: string; label: string }> = {
  docx: { extension: '.docx', label: 'Word' },
  udf: { extension: '.udf', label: 'UYAP' }
}

/** Value for an <input type="file"> accept attribute. */
export const TEMPLATE_ACCEPT = '.docx,.udf'

export function detectFormat(fileName: string): TemplateFormat | null {
  const lower = fileName.toLowerCase()

  if (lower.endsWith('.docx')) return 'docx'
  if (lower.endsWith('.udf')) return 'udf'

  return null
}

export function inspectTemplateBuffer(
  buffer: ArrayBuffer,
  fileName: string,
  format: TemplateFormat
): TemplateData {
  return format === 'udf'
    ? inspectUdfBuffer(buffer, fileName)
    : inspectDocxBuffer(buffer, fileName)
}

/** Reads an uploaded template once and lists every placeholder it contains. */
export async function inspectTemplate(file: File): Promise<TemplateData> {
  const format = detectFormat(file.name)

  if (!format) {
    throw new AppError(
      'TEMPLATE_WRONG_EXTENSION',
      'Yalnızca .docx (Word) ve .udf (UYAP) şablonları desteklenir.',
      'Eski .doc dosyalarını Word’de “Farklı Kaydet → .docx” ile dönüştürebilirsiniz.'
    )
  }

  return inspectTemplateBuffer(await file.arrayBuffer(), file.name, format)
}

/** Renders one document from a pristine copy of the template. */
export function renderTemplate(
  template: TemplateData,
  row: ExcelRow,
  ignored?: IgnoredFields
): Uint8Array {
  return template.format === 'udf'
    ? renderUdf(template.buffer, row, template.syntax, ignored)
    : renderDocx(template.buffer, row, template.syntax, ignored)
}

export function extensionFor(format: TemplateFormat): string {
  return TEMPLATE_FORMATS[format].extension
}
