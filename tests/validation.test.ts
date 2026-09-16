import { describe, expect, it } from 'vitest'
import { validate } from '~/utils/validation'
import type { ExcelData, TemplateData } from '~/types'

function template(placeholders: string[]): TemplateData {
  return {
    fileName: 'sablon.docx',
    format: 'docx',
    syntax: 'square',
    notices: { hasSignature: false },
    buffer: new ArrayBuffer(0),
    placeholders
  }
}

function excel(headers: string[], rowCount = 1): ExcelData {
  return {
    fileName: 'liste.xlsx',
    headers,
    rows: Array.from({ length: rowCount }, (_, index) => ({
      excelRow: index + 2,
      values: Object.fromEntries(headers.map((h) => [h, 'x']))
    })),
    notices: {
      sheetName: 'Sayfa 1',
      sheetCount: 1,
      skippedEmptyRows: 0,
      reformattedDateCells: 0,
      roundedNumberCells: 0
    }
  }
}

describe('validate', () => {
  it('accepts a matching pair', () => {
    const result = validate(template(['AD_SOYAD', 'TC_KIMLIK']), excel(['AD_SOYAD', 'TC_KIMLIK'], 53))

    expect(result.ok).toBe(true)
    expect(result.matched).toEqual(['AD_SOYAD', 'TC_KIMLIK'])
    expect(result.rowCount).toBe(53)
    expect(result.errors).toHaveLength(0)
  })

  it('blocks generation when a template field has no Excel column', () => {
    const result = validate(template(['AD_SOYAD', 'TELEFON']), excel(['AD_SOYAD']))

    expect(result.ok).toBe(false)
    expect(result.missingFields).toEqual(['TELEFON'])
    expect(result.errors[0]).toContain('TELEFON')
  })

  it('treats extra Excel columns as informational, not an error', () => {
    const result = validate(template(['AD_SOYAD']), excel(['AD_SOYAD', 'NOTLAR']))

    expect(result.ok).toBe(true)
    expect(result.unusedColumns).toEqual(['NOTLAR'])
  })

  it('blocks when the Excel file has headers but no records', () => {
    const result = validate(template(['AD_SOYAD']), excel(['AD_SOYAD'], 0))

    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toContain('veri satırı yok')
  })

  it('blocks when the template has no placeholders', () => {
    const result = validate(template([]), excel(['AD_SOYAD']))
    expect(result.ok).toBe(false)
  })

  it('an ignored placeholder stops being a required field', () => {
    const blocked = validate(template(['AD_SOYAD', 'Madde 5']), excel(['AD_SOYAD']))
    expect(blocked.ok).toBe(false)
    expect(blocked.missingFields).toEqual(['Madde 5'])

    const allowed = validate(
      template(['AD_SOYAD', 'Madde 5']),
      excel(['AD_SOYAD']),
      new Set(['Madde 5'])
    )
    expect(allowed.ok).toBe(true)
    expect(allowed.missingFields).toEqual([])
    expect(allowed.ignoredFields).toEqual(['Madde 5'])
    expect(allowed.placeholderCount).toBe(1)
  })
})

describe('messages name the right format and syntax', () => {
  function udfTemplate(placeholders: string[], syntax: 'square' | 'curly' = 'square'): TemplateData {
    return {
      fileName: 'sablon.udf',
      format: 'udf',
      syntax,
      notices: { hasSignature: false },
      buffer: new ArrayBuffer(0),
      placeholders
    }
  }

  it('says UYAP, not Word, for a UDF template', () => {
    const result = validate(udfTemplate([]), excel(['A']))

    expect(result.errors[0]).toContain('UYAP')
    expect(result.errors[0]).not.toContain('Word')
  })

  it('shows the example in the style the template already uses', () => {
    expect(validate(udfTemplate([], 'curly'), excel(['A'])).errors[0]).toContain('{{AD_SOYAD}}')
    expect(validate(udfTemplate([], 'square'), excel(['A'])).errors[0]).toContain('[AD_SOYAD]')
  })

  it('distinguishes "no fields" from "you marked them all as text"', () => {
    const marked = validate(udfTemplate(['Madde 5']), excel(['A']), new Set(['Madde 5']))

    expect(marked.ok).toBe(false)
    expect(marked.errors[0]).toContain('düz metin olarak işaretlendi')
    expect(marked.errors[0]).not.toContain('alan bulunamadı')
  })
})
