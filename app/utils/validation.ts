import type {
  ExcelData,
  IgnoredFields,
  PlaceholderSyntax,
  TemplateData,
  TemplateFormat,
  ValidationResult
} from '~/types'

/** Messages name the format the user actually uploaded, not always "Word". */
const TEMPLATE_LABEL: Record<TemplateFormat, string> = {
  docx: 'Word',
  udf: 'UYAP'
}

/** And the example matches the delimiter style the template already uses. */
const EXAMPLE_FIELD: Record<PlaceholderSyntax, string> = {
  curly: '{{AD_SOYAD}}',
  square: '[AD_SOYAD]'
}

/**
 * Compares template placeholders with Excel column names. Pure and UI-free so
 * it can be unit tested without any file handling.
 */
export function validate(
  template: TemplateData,
  excel: ExcelData,
  ignored: IgnoredFields = new Set()
): ValidationResult {
  const columns = new Set(excel.headers)
  // A placeholder the user marked as ordinary text is not a field at all.
  const placeholders = template.placeholders.filter((name) => !ignored.has(name))

  const matched = placeholders.filter((name) => columns.has(name))
  const missingFields = placeholders.filter((name) => !columns.has(name))
  // Extra Excel columns are deliberately not an error.
  const unusedColumns = excel.headers.filter((header) => !placeholders.includes(header))

  const errors: string[] = []
  const ignoredHere = [...ignored].filter((name) => template.placeholders.includes(name))

  if (placeholders.length === 0) {
    // Two very different situations, and the user deserves to be told which:
    // a template that never had fields, or one whose fields they just marked
    // as ordinary text. Either way there is nothing to fill in, so every
    // generated document would be an identical copy.
    errors.push(
      ignoredHere.length > 0
        ? 'Şablondaki tüm alanlar düz metin olarak işaretlendi. Belge üretmek için en az bir alan gerekir.'
        : `${TEMPLATE_LABEL[template.format]} şablonunda alan bulunamadı. Şablona ${EXAMPLE_FIELD[template.syntax]} gibi alanlar ekleyin.`
    )
  }

  if (excel.rows.length === 0) {
    errors.push('Excel dosyasında veri satırı yok. İlk satır sütun adları, sonraki satırlar kayıtlardır.')
  }

  if (missingFields.length > 0) {
    errors.push(
      missingFields.length === 1
        ? `Excel dosyasında eksik alan: ${missingFields[0]}`
        : `Excel dosyasında eksik alanlar: ${missingFields.join(', ')}`
    )
  }

  return {
    ok: errors.length === 0,
    placeholderCount: placeholders.length,
    ignoredFields: ignoredHere,
    columnCount: excel.headers.length,
    rowCount: excel.rows.length,
    matched,
    missingFields,
    unusedColumns,
    errors
  }
}
