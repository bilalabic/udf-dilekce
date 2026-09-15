import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import PizZip from 'pizzip'
import readXlsxFile from 'read-excel-file/node'
import { inspectUdfBuffer } from '~/utils/udf'
import { parseRows } from '~/utils/excel'
import { generateDocuments, buildReport } from '~/utils/generate'
import { buildZip, REPORT_ENTRY } from '~/utils/zip'

function buf(p: string): ArrayBuffer {
  const f = readFileSync(p)
  return f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer
}

/**
 * The whole chain on a template derived from real UYAP output: read the .udf,
 * read the Excel, render every row, zip it. Everything else tests a piece; this
 * tests the piece boundaries.
 */
describe('full pipeline on a template derived from a real UYAP document', () => {
  it('produces documents whose offsets still tile exactly', async () => {
    const template = inspectUdfBuffer(buf('tests/fixtures/uyap-sablon.udf'), 'uyap-sablon.udf')
    const rows = await readXlsxFile('tests/fixtures/uyap-liste.xlsx', { trim: true })
    const excel = parseRows('uyap-liste.xlsx', rows as never)

    expect(template.placeholders.sort()).toEqual(['AD_SOYAD_TESTXX', 'TELEFON_XXXX'])

    const result = await generateDocuments(template, excel)
    expect(result.documents).toHaveLength(3)
    expect(result.skipped).toEqual([])

    const zip = new PizZip(await buildZip(result.documents, buildReport(template, excel, result)).arrayBuffer())
    expect(zip.file(REPORT_ENTRY)).toBeTruthy()

    for (const [i, expected] of [
      ['Çiğdem Şahin-Öztürk', '0532 111 22 33'],
      ['Mehmet Kaya', '0555 444 55 66'],
      ['İbrahim Ağaoğlu', '0543 777 88 99']
    ].entries()) {
      const doc = zip.file(`Dilekce_00${i + 1}.udf`)!.asUint8Array()
      const xml = new PizZip(doc).file('content.xml')!.asText()
      const text = /<content\b[^>]*>\s*<!\[CDATA\[([\s\S]*?)]]>/.exec(xml)![1]!

      expect(text).toContain(expected[0])
      expect(text).toContain(expected[1])
      expect(text).not.toContain('[AD_SOYAD_TESTXX]')
      expect(xml).not.toContain('length="0"')

      let cursor = 0
      for (const m of xml.matchAll(/<\w+[^>]*?\bstartOffset="(\d+)"[^>]*?\blength="(\d+)"/g)) {
        expect(Number(m[1])).toBe(cursor)
        cursor = Number(m[1]) + Number(m[2])
      }
      // The real-file convention: exactly one trailing newline uncovered.
      expect(text.length - cursor).toBe(1)
      expect(xml).toContain('format_id="1.8"')
      expect(xml).toContain('<webID')
    }
  })
})
