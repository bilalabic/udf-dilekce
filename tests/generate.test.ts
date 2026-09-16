import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import PizZip from 'pizzip'
import readXlsxFile from 'read-excel-file/node'
import { inspectDocxBuffer } from '~/utils/docx'
import { inspectUdfBuffer } from '~/utils/udf'
import { parseRows } from '~/utils/excel'
import { validate } from '~/utils/validation'
import { buildReport, generateDocuments } from '~/utils/generate'
import { REPORT_ENTRY, buildZip } from '~/utils/zip'
import type { ExcelData, TemplateData } from '~/types'
import { AppError } from '~/utils/errors'

const fixtures = resolve(__dirname, 'fixtures')

function loadTemplate(): TemplateData {
  const file = readFileSync(resolve(fixtures, 'sablon.docx'))
  const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer

  return inspectDocxBuffer(buffer, 'sablon.docx')
}

async function loadExcel(): Promise<ExcelData> {
  const rows = await readXlsxFile(resolve(fixtures, 'liste.xlsx'), { trim: true })
  return parseRows('liste.xlsx', rows as never)
}

function textOf(docx: Uint8Array, part: string): string {
  return new PizZip(docx).file(part)!.asText()
}

describe('template inspection', () => {
  it('finds placeholders split across runs, repeated, and inside the header', () => {
    const { placeholders } = loadTemplate()

    expect(placeholders).toContain('AD_SOYAD') // split across two <w:t> runs and reused in the header
    expect(placeholders).toContain('TC_KIMLIK')
    expect(placeholders).toContain('ADRES')
    expect(placeholders).toContain('TARIH')
    // Literal bracketed prose is indistinguishable from a field by design.
    expect(placeholders).toContain('Madde 5')
  })

  it('rejects a file that is not a DOCX package', () => {
    expect(() => inspectDocxBuffer(new TextEncoder().encode('not a zip').buffer, 'x.docx')).toThrow()
  })
})

describe('end-to-end generation', () => {
  it('produces one document per row with every placeholder replaced', async () => {
    const template = loadTemplate()
    const excel = await loadExcel()
    const result = validate(template, excel)

    expect(result.ok).toBe(true)
    expect(result.unusedColumns).toEqual(['NOT_KULLANILMIYOR'])

    const progress: number[] = []
    const { documents, skipped } = await generateDocuments(template, excel, {
      chunkSize: 2,
      onProgress: (completed) => progress.push(completed)
    })

    expect(skipped).toEqual([])

    expect(documents).toHaveLength(excel.rows.length)
    expect(progress).toEqual([1, 2, 3, 4])

    const body = textOf(documents[0]!.data, 'word/document.xml')

    // The placeholder Word had split across two runs is now real text.
    expect(body).toContain('Ahmet Yılmaz')
    expect(body).not.toContain('[AD_')
    expect(body).toContain('12345678901')
    expect(body).not.toMatch(/\dE\+/) // no scientific notation
    // The same placeholder used twice in one paragraph is replaced everywhere.
    expect(body.match(/Elazığ/g)).toHaveLength(2)
    expect(body).toContain('01.09.2026')
    // Turkish text around the fields is untouched.
    expect(body).toContain('ÇŞĞÜÖİı karakter testi')
    // The unbalanced bracket is copied through instead of throwing.
    expect(body).toContain('[KDV dahil')
    // Bold formatting on the placeholder run survives.
    expect(body).toContain('<w:b/>')

    // Headers are templated too.
    expect(textOf(documents[0]!.data, 'word/header1.xml')).toContain('Ahmet Yılmaz')
  })

  it('leaves empty cells blank rather than writing "undefined"', async () => {
    const { documents } = await generateDocuments(loadTemplate(), await loadExcel())
    const body = textOf(documents[1]!.data, 'word/document.xml')

    expect(body).toContain('Mehmet Kaya')
    expect(body).not.toContain('undefined')
    expect(body).toContain('Adres:  —')
  })

  it('names files from AD_SOYAD and de-duplicates collisions', async () => {
    const { documents } = await generateDocuments(loadTemplate(), await loadExcel())

    expect(documents.map((d) => d.fileName)).toEqual([
      'Dilekce_001_Ahmet_Yilmaz.docx',
      'Dilekce_002_Mehmet_Kaya.docx',
      'Dilekce_003_Cigdem_SahinOz.docx',
      'Dilekce_004_Ahmet_Yilmaz.docx'
    ])
  })

  it('packages every document into one archive', async () => {
    const { documents } = await generateDocuments(loadTemplate(), await loadExcel())
    const blob = buildZip(documents)
    const archive = new PizZip(await blob.arrayBuffer())

    expect(Object.keys(archive.files)).toHaveLength(documents.length)
    expect(archive.file('Dilekce_001_Ahmet_Yilmaz.docx')).toBeTruthy()
    expect(blob.size).toBeGreaterThan(0)
  })
})

describe('UDF pipeline', () => {
  function loadUdfTemplate(): TemplateData {
    const file = readFileSync(resolve(fixtures, 'sablon.udf'))
    const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer

    return inspectUdfBuffer(buffer, 'sablon.udf')
  }

  it('validates against the same Excel file as the DOCX template', async () => {
    const result = validate(loadUdfTemplate(), await loadExcel())

    expect(result.ok).toBe(true)
    expect(result.unusedColumns).toEqual(['NOT_KULLANILMIYOR'])
  })

  it('names the generated files with the .udf extension', async () => {
    const { documents } = await generateDocuments(loadUdfTemplate(), await loadExcel())

    expect(documents.map((d) => d.fileName)).toEqual([
      'Dilekce_001_Ahmet_Yilmaz.udf',
      'Dilekce_002_Mehmet_Kaya.udf',
      'Dilekce_003_Cigdem_SahinOz.udf',
      'Dilekce_004_Ahmet_Yilmaz.udf'
    ])
  })

  it('produces valid UDF documents with consistent offsets for every row', async () => {
    const { documents } = await generateDocuments(loadUdfTemplate(), await loadExcel())
    const excel = await loadExcel()

    documents.forEach((document, index) => {
      const xml = new PizZip(document.data).file('content.xml')!.asText()
      const text = /<content\b[^>]*>\s*<!\[CDATA\[([\s\S]*?)]]>/.exec(xml)![1]!

      expect(text).toContain(excel.rows[index]!.values.AD_SOYAD!)
      expect(text).toContain(excel.rows[index]!.values.TC_KIMLIK!)

      // Offsets must still tile the text exactly, row by row, leaving only the
      // document's final newline uncovered.
      let cursor = 0
      for (const run of xml.matchAll(/startOffset="(\d+)" length="(\d+)"/g)) {
        expect(Number(run[1])).toBe(cursor)
        cursor = Number(run[1]) + Number(run[2])
      }
      expect(text.length - cursor).toBe(1)
    })
  })

  it('packages UDF documents into the same ZIP archive', async () => {
    const { documents } = await generateDocuments(loadUdfTemplate(), await loadExcel())
    const archive = new PizZip(await buildZip(documents).arrayBuffer())

    expect(Object.keys(archive.files)).toHaveLength(4)
    expect(archive.file('Dilekce_001_Ahmet_Yilmaz.udf')).toBeTruthy()
  })
})

describe('placeholder syntax detection', () => {
  function loadCurly(): TemplateData {
    const file = readFileSync(resolve(fixtures, 'sablon-curly.docx'))
    const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer

    return inspectDocxBuffer(buffer, 'sablon-curly.docx')
  }

  it('reads a square-bracket template as square', () => {
    const template = loadTemplate()

    expect(template.syntax).toBe('square')
    expect(template.placeholders).toContain('Madde 5')
  })

  it('switches to double braces when the template uses them', () => {
    const template = loadCurly()

    expect(template.syntax).toBe('curly')
    expect(template.placeholders).toContain('AD_SOYAD')
    expect(template.placeholders).toContain('TARIH')
  })

  it('leaves bracketed prose alone in a double-brace template', () => {
    // This is the whole point of supporting {{ }}: "[Madde 5]" is prose, not a
    // field, and nothing needs to be marked by hand.
    expect(loadCurly().placeholders).not.toContain('Madde 5')
  })

  it('renders a double-brace template and keeps the brackets as text', async () => {
    const template = loadCurly()
    const excel = await loadExcel()
    const { documents } = await generateDocuments(template, excel)
    const body = textOf(documents[0]!.data, 'word/document.xml')

    expect(body).toContain('Ahmet Yılmaz')
    expect(body).toContain('12345678901')
    expect(body).toContain('[Madde 5]')
    expect(body).not.toContain('{{')
  })
})

describe('ignored placeholders', () => {
  it('writes the literal back instead of an empty string', async () => {
    const template = loadTemplate()
    const excel = await loadExcel()
    // Drop the column so "Madde 5" is only satisfiable by ignoring it.
    const withoutColumn: ExcelData = {
      ...excel,
      headers: excel.headers.filter((h) => h !== 'Madde 5'),
      rows: excel.rows.map(({ excelRow, values: { 'Madde 5': _unused, ...rest } }) => ({
        excelRow,
        values: rest
      }))
    }

    const { documents } = await generateDocuments(template, withoutColumn, {
      ignoredFields: new Set(['Madde 5'])
    })
    const body = textOf(documents[0]!.data, 'word/document.xml')

    expect(body).toContain('[Madde 5]')
    expect(body).toContain('Ahmet Yılmaz')
  })
})

describe('the report inside the archive', () => {
  it('records the counts and the sheet that was read', async () => {
    const template = loadTemplate()
    const excel = await loadExcel()
    const result = await generateDocuments(template, excel)
    const report = buildReport(template, excel, result)

    expect(report).toContain('sablon.docx')
    expect(report).toContain('liste.xlsx')
    expect(report).toContain('Uretilen belge   : 4')
    expect(report).toContain('Atlanan satir    : 0')
  })

  it('names every skipped row so nothing disappears quietly', () => {
    const report = buildReport(
      { fileName: 't.docx', format: 'docx', syntax: 'square', notices: { hasSignature: false }, buffer: new ArrayBuffer(0), placeholders: [] },
      {
        fileName: 'l.xlsx',
        headers: [],
        rows: [],
        notices: {
          sheetName: 'Sayfa 1',
          sheetCount: 1,
          skippedEmptyRows: 2,
          reformattedDateCells: 0,
          roundedNumberCells: 1
        }
      },
      { documents: [], skipped: [{ excelRow: 12, reason: 'bozuk deger' }] }
    )

    expect(report).toContain('Excel satir 12: bozuk deger')
    expect(report).toContain('Bos satir        : 2')
    // A number Excel had already rounded is part of the durable record too.
    expect(report).toContain('Yuvarlanan sayi  : 1 hucre')
    expect(report).toContain('URETILMEDI')
  })

  it('travels inside the ZIP', async () => {
    const template = loadTemplate()
    const excel = await loadExcel()
    const result = await generateDocuments(template, excel)
    const blob = buildZip(result.documents, buildReport(template, excel, result))
    const archive = new PizZip(await blob.arrayBuffer())

    expect(archive.file(REPORT_ENTRY)).toBeTruthy()
    expect(archive.file(REPORT_ENTRY)!.asText()).toContain('URETIM RAPORU')
  })
})
