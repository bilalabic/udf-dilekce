import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import PizZip from 'pizzip'
import {
  applyReplacements,
  coverageOf,
  detectPlaceholders,
  detectSyntax,
  escapeCdata,
  inspectUdfBuffer,
  mapOffset,
  renderUdf,
  splitContentXml,
  unescapeCdata
} from '~/utils/udf'
import { AppError } from '~/utils/errors'
import type { ExcelRow } from '~/types'

const fixtures = resolve(__dirname, 'fixtures')

function loadFixture(): ArrayBuffer {
  const file = readFileSync(resolve(fixtures, 'sablon.udf'))
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer
}

function contentXmlOf(udf: Uint8Array): string {
  return new PizZip(udf).file('content.xml')!.asText()
}

interface Run {
  start: number
  length: number
  tag: string
}

/** Every element that indexes into the shared text, in document order. */
function runsOf(xml: string): Run[] {
  const runs: Run[] = []

  for (const match of xml.matchAll(/<(\w+)([^>]*\bstartOffset="(\d+)"[^>]*)\/>/g)) {
    const length = /\blength="(\d+)"/.exec(match[2]!)
    if (!length) continue
    runs.push({ tag: match[1]!, start: Number(match[3]), length: Number(length[1]) })
  }

  return runs
}

/**
 * The invariant that decides whether a UDF opens correctly: the runs must tile
 * the text exactly - starting at 0, each beginning where the last ended, with
 * only the document's final newline left uncovered.
 */
function expectExactTiling(xml: string): void {
  const { text } = splitContentXml(xml)
  const runs = runsOf(xml)

  expect(runs.length).toBeGreaterThan(0)

  let cursor = 0
  let rebuilt = ''

  for (const run of runs) {
    expect(run.start).toBe(cursor)
    rebuilt += text.slice(run.start, run.start + run.length)
    cursor = run.start + run.length
  }

  expect(rebuilt).toBe(text.slice(0, cursor))
  // Real UYAP documents leave exactly one trailing newline uncovered.
  expect(text.length - cursor).toBe(1)
  expect(text.endsWith('\n')).toBe(true)
}

const ROW: ExcelRow = {
  AD_SOYAD: 'Ahmet Yılmaz',
  TC_KIMLIK: '12345678901',
  ADRES: 'Elazığ',
  TARIH: '01.09.2026',
  'Madde 5': '5. madde'
}

describe('mapOffset', () => {
  const edits = [{ start: 10, end: 20, newLength: 4 }]

  it('leaves positions before the edit alone', () => {
    expect(mapOffset(0, edits)).toBe(0)
    expect(mapOffset(10, edits)).toBe(10)
  })

  it('shifts positions after the edit by the length difference', () => {
    expect(mapOffset(20, edits)).toBe(14)
    expect(mapOffset(30, edits)).toBe(24)
  })

  it('collapses positions inside the edit to the end of the new value', () => {
    expect(mapOffset(15, edits)).toBe(14)
  })

  it('accumulates across several edits', () => {
    const many = [
      { start: 0, end: 5, newLength: 10 },
      { start: 20, end: 25, newLength: 0 }
    ]

    expect(mapOffset(5, many)).toBe(10)
    expect(mapOffset(20, many)).toBe(25)
    expect(mapOffset(25, many)).toBe(25)
    expect(mapOffset(30, many)).toBe(30)
  })
})

describe('CDATA escaping', () => {
  const terminator = ']]' + '>'

  it('round-trips a value that would close the block early', () => {
    const text = `a${terminator}b`

    expect(escapeCdata(text)).not.toBe(text)
    expect(unescapeCdata(escapeCdata(text))).toBe(text)
  })

  it('leaves ordinary text untouched', () => {
    expect(escapeCdata('Sayın Ahmet')).toBe('Sayın Ahmet')
  })
})

describe('coverageOf', () => {
  it('reports contiguous runs and how much text they cover', () => {
    const xml = '<content startOffset="0" length="5"/><content startOffset="5" length="3"/>'

    expect(coverageOf(xml)).toEqual({ contiguous: true, covered: 8 })
  })

  it('notices a gap', () => {
    const xml = '<content startOffset="0" length="5"/><content startOffset="7" length="3"/>'

    expect(coverageOf(xml).contiguous).toBe(false)
  })
})

describe('detectPlaceholders', () => {
  it('finds fields and ignores unbalanced brackets', () => {
    expect(detectPlaceholders('Sayın [AD_SOYAD], [TC] ve [ kalan')).toEqual(['AD_SOYAD', 'TC'])
  })

  it('does not match across a line break', () => {
    expect(detectPlaceholders('[AD\nSOYAD]')).toEqual([])
  })

  it('returns each name once', () => {
    expect(detectPlaceholders('[A] [A] [B]')).toEqual(['A', 'B'])
  })
})

describe('applyReplacements', () => {
  it('reports an edit per occurrence, including repeats', () => {
    const { text, edits } = applyReplacements('[A]-[A]', { A: 'xy' })

    expect(text).toBe('xy-xy')
    expect(edits).toEqual([
      { start: 0, end: 3, newLength: 2 },
      { start: 4, end: 7, newLength: 2 }
    ])
  })

  it('writes an empty string for a missing or empty value', () => {
    expect(applyReplacements('a[X]b', {}).text).toBe('ab')
    expect(applyReplacements('a[X]b', { X: '' }).text).toBe('ab')
  })

  it('flattens newlines so the paragraph model stays in sync', () => {
    expect(applyReplacements('[A]', { A: 'bir\niki' }).text).toBe('bir iki')
  })

  it('keeps the value itself intact, escaping only at serialisation time', () => {
    const terminator = ']]' + '>'
    const { text } = applyReplacements('[A]', { A: `x${terminator}y` })

    expect(text).toBe(`x${terminator}y`)
  })
})

describe('template inspection', () => {
  it('lists the placeholders, including the literal bracketed prose', () => {
    const { placeholders, format } = inspectUdfBuffer(loadFixture(), 'sablon.udf')

    expect(format).toBe('udf')
    expect(placeholders).toContain('AD_SOYAD')
    expect(placeholders).toContain('TC_KIMLIK')
    expect(placeholders).toContain('ADRES')
    expect(placeholders).toContain('TARIH')
    expect(placeholders).toContain('Madde 5')
    expect(placeholders).not.toContain('KDV dahil değildir.')
  })

  it('sees placeholders that the file stores as several runs', () => {
    // "[AD_SOYAD]" is two bold runs and "[Madde 5]" is broken by a <space> run;
    // detection works on the flat text, so neither split is visible here.
    const xml = new PizZip(loadFixture()).file('content.xml')!.asText()

    expect(xml).toContain('<content bold="true" startOffset="6" length="4"/>')
    expect(xml).toContain('<space startOffset="122" length="1"/>')
  })

  it('confirms the fixture itself satisfies the tiling invariant', () => {
    expectExactTiling(new PizZip(loadFixture()).file('content.xml')!.asText())
  })

  it('rejects a ZIP with no content.xml', () => {
    const zip = new PizZip()
    zip.file('other.xml', '<a/>')
    const bytes = zip.generate({ type: 'uint8array' }) as Uint8Array

    expect(() => inspectUdfBuffer(bytes.buffer as ArrayBuffer, 'x.udf')).toThrow(AppError)
  })

  it('rejects a file that is not a ZIP at all', () => {
    expect(() => inspectUdfBuffer(new TextEncoder().encode('hello').buffer, 'x.udf')).toThrow(
      AppError
    )
  })
})

describe('rendering', () => {
  it('replaces every placeholder, including split and repeated ones', () => {
    const xml = contentXmlOf(renderUdf(loadFixture(), ROW))
    const { text } = splitContentXml(xml)

    expect(text).toContain('Sayın Ahmet Yılmaz, başvurunuz alınmıştır.')
    expect(text).toContain('12345678901')
    expect(text.match(/Elazığ/g)).toHaveLength(2)
    expect(text).toContain('01.09.2026')
    expect(text).toContain('İlgili mevzuat 5. madde hükmü')
    expect(text).not.toContain('[AD_')
    // Unbalanced bracket and Turkish text are untouched.
    expect(text).toContain('[KDV dahil değildir.')
    expect(text).toContain('ÇŞĞÜÖİı karakter testi')
  })

  it('keeps the offsets tiling the text exactly', () => {
    expectExactTiling(contentXmlOf(renderUdf(loadFixture(), ROW)))
  })

  it('remaps offsets inside table cells too', () => {
    const rendered = renderUdf(loadFixture(), ROW)
    const xml = contentXmlOf(rendered)
    const { text } = splitContentXml(xml)

    // The cell paragraph points into the same pool as everything else, so the
    // whole-document tiling check above already covers it; this pins the value.
    const cellRuns = /<cell><paragraph><content startOffset="(\d+)" length="(\d+)"\/>/g
    const matches = [...xml.matchAll(cellRuns)]

    expect(matches.length).toBe(2)
    const [, start, length] = matches[1]!
    expect(text.slice(Number(start), Number(start) + Number(length))).toBe('01.09.2026\n')
  })

  it('gives the whole replacement to the first run and drops the emptied one', () => {
    const xml = contentXmlOf(renderUdf(loadFixture(), ROW))
    const runs = runsOf(xml)

    // Fixture runs: "Sayın " (6), "[AD_" (4, bold), "SOYAD]" (6, bold), rest.
    // "[AD_SOYAD]" spans runs 1 and 2, so run 1 absorbs "Ahmet Yılmaz" (12) and
    // run 2 - consumed entirely - is removed rather than left at length 0.
    expect(runs[0]).toMatchObject({ start: 0, length: 6 })
    expect(runs[1]).toMatchObject({ start: 6, length: 12 })
    expect(runs[2]).toMatchObject({ start: 18 })
    expect(xml).not.toContain('length="0"')
    expect(xml).toContain('bold="true"')
  })

  it('preserves everything it does not understand', () => {
    const xml = contentXmlOf(renderUdf(loadFixture(), ROW))

    expect(xml).toContain('format_id="1.8"')
    expect(xml).toContain('resolver="hvl-default"')
    expect(xml).toContain('mediaSizeName="1"')
    expect(xml).toContain('<style name="default"')
    expect(xml).toContain('tableName="Sabit"')
    // The exact prolog UYAP writes, including its trailing space.
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8" ?> \n\n')).toBe(true)
  })

  it('drops the signature because it can no longer match the content', () => {
    const files = Object.keys(new PizZip(renderUdf(loadFixture(), ROW)).files)

    expect(files).toContain('content.xml')
    expect(files).toContain('documentproperties.xml')
    expect(files).not.toContain('sign.sgn')
  })

  it('writes a ZIP', () => {
    const rendered = renderUdf(loadFixture(), ROW)

    expect(String.fromCharCode(rendered[0]!, rendered[1]!)).toBe('PK')
  })

  it('escapes a value that would close the CDATA block early', () => {
    const terminator = ']]' + '>'
    const xml = contentXmlOf(renderUdf(loadFixture(), { ...ROW, ADRES: `a${terminator}b` }))

    expect(xml).toContain(']]]]><![CDATA[>')
    // Decoded again, the value is exactly what the user typed.
    expect(splitContentXml(xml).text).toContain(`a${terminator}b`)
    expectExactTiling(xml)
  })

  it('shortens offsets correctly when a value is empty', () => {
    const xml = contentXmlOf(renderUdf(loadFixture(), { ...ROW, ADRES: '' }))

    expect(splitContentXml(xml).text).toContain('Adres:  - Şehir: ')
    expectExactTiling(xml)
  })

  it('handles a value longer than the whole original paragraph', () => {
    const long = 'Ç'.repeat(500)
    const xml = contentXmlOf(renderUdf(loadFixture(), { ...ROW, ADRES: long }))

    expect(splitContentXml(xml).text).toContain(long)
    expectExactTiling(xml)
  })

  it('stays consistent when every value is empty', () => {
    expectExactTiling(contentXmlOf(renderUdf(loadFixture(), {})))
  })
})

describe('placeholder syntax', () => {
  it('picks double braces whenever the template uses them', () => {
    expect(detectSyntax('Sayın {{AD_SOYAD}}, [Madde 5] uyarınca')).toBe('curly')
    expect(detectSyntax('Sayın [AD_SOYAD], [Madde 5] uyarınca')).toBe('square')
  })

  it('reads only the braced names in a double-brace template', () => {
    const text = 'Sayın {{AD_SOYAD}}, [Madde 5] uyarınca {{TARIH}}'

    expect(detectPlaceholders(text, 'curly')).toEqual(['AD_SOYAD', 'TARIH'])
    // The bracketed prose is not a field here, so nothing has to be marked.
    expect(detectPlaceholders(text, 'curly')).not.toContain('Madde 5')
  })

  it('replaces braced fields and leaves the brackets untouched', () => {
    const { text } = applyReplacements('{{AD}} - [Madde 5]', { AD: 'Ahmet' }, 'curly')

    expect(text).toBe('Ahmet - [Madde 5]')
  })
})

describe('ignored placeholders', () => {
  it('records no edit at all, so the original characters survive', () => {
    const { text, edits } = applyReplacements(
      'Sayın [AD_SOYAD], [Madde 5] uyarınca',
      { AD_SOYAD: 'Ahmet Yılmaz' },
      'square',
      new Set(['Madde 5'])
    )

    expect(text).toBe('Sayın Ahmet Yılmaz, [Madde 5] uyarınca')
    // One edit only - the ignored placeholder shifts nothing.
    expect(edits).toHaveLength(1)
  })

  it('keeps the offsets tiling the text when a field is ignored', () => {
    const xml = contentXmlOf(
      renderUdf(loadFixture(), { ...ROW, 'Madde 5': 'YOKSAYILMALI' }, 'square', new Set(['Madde 5']))
    )

    expect(splitContentXml(xml).text).toContain('[Madde 5]')
    expect(splitContentXml(xml).text).not.toContain('YOKSAYILMALI')
    expectExactTiling(xml)
  })
})
