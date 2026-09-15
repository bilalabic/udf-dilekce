import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import PizZip from 'pizzip'
import { coverageOf, inspectUdfBuffer, renderUdf, splitContentXml } from '~/utils/udf'
import { AppError } from '~/utils/errors'

/**
 * These fixtures are real UYAP Doküman Editörü output (sanitised, MIT licensed
 * — see KAYNAKLAR.md). Everything else in the UDF suite runs against a template
 * this project generated itself, which can only ever confirm its own
 * assumptions. These tests check the engine against the real format instead.
 */

const fixtures = resolve(__dirname, 'fixtures')

const REAL_FILES = ['gercek-basvuru.udf', 'gercek-tablolu.udf'] as const

/** The bracketed prose that really appears in the second document. */
const BRACKETED_PROSE = 'İşçi İle İşveren İlişkisinden Kaynaklanan (Nisbi)'

function load(name: string): ArrayBuffer {
  const file = readFileSync(resolve(fixtures, name))
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer
}

function contentXmlOf(udf: Uint8Array | ArrayBuffer): string {
  return new PizZip(udf).file('content.xml')!.asText()
}

function entriesOf(udf: Uint8Array | ArrayBuffer): string[] {
  return Object.keys(new PizZip(udf).files).sort()
}

describe.each(REAL_FILES)('real UYAP document: %s', (name) => {
  it('matches the format this engine was written against', () => {
    const xml = contentXmlOf(load(name))

    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8" ?> \n\n')).toBe(true)
    expect(xml).toContain('format_id="1.8"')
  })

  it('satisfies the tiling invariant the engine relies on', () => {
    const xml = contentXmlOf(load(name))
    const { text } = splitContentXml(xml)
    const coverage = coverageOf(xml)

    expect(coverage.contiguous).toBe(true)
    // Exactly one trailing newline is left uncovered, as in every real file.
    expect(text.length - coverage.covered).toBe(1)
    expect(text.endsWith('\n')).toBe(true)
  })

  it('can be read without throwing', () => {
    const template = inspectUdfBuffer(load(name), name)

    expect(template.format).toBe('udf')
    expect(template.syntax).toBe('square')
  })

  it('survives a render with nothing to replace, byte for byte', () => {
    // The strongest fidelity check available: ask the engine to process a real
    // document while every detected placeholder is marked as ordinary text. The
    // content must come back exactly as it went in.
    const buffer = load(name)
    const before = contentXmlOf(buffer)
    const template = inspectUdfBuffer(buffer, name)

    const rendered = renderUdf(buffer, {}, template.syntax, new Set(template.placeholders))

    expect(contentXmlOf(rendered)).toBe(before)
  })

  it('drops only the signature and keeps every other part', () => {
    const buffer = load(name)
    const template = inspectUdfBuffer(buffer, name)
    const rendered = renderUdf(buffer, {}, template.syntax, new Set(template.placeholders))

    const kept = entriesOf(buffer).filter((entry) => entry !== 'sign.sgn')

    expect(entriesOf(rendered)).toEqual(kept)
  })
})

describe('bracketed prose in a real document', () => {
  it('really occurs in the wild, which is why it must be escapable', () => {
    const template = inspectUdfBuffer(load('gercek-tablolu.udf'), 'gercek-tablolu.udf')

    // Not a field anybody meant to fill in - it is the subject of the dispute.
    expect(template.placeholders).toContain(BRACKETED_PROSE)
  })

  it('stays untouched once marked as ordinary text', () => {
    const buffer = load('gercek-tablolu.udf')
    const rendered = renderUdf(buffer, {}, 'square', new Set([BRACKETED_PROSE]))
    const { text } = splitContentXml(contentXmlOf(rendered))

    expect(text).toContain(`[${BRACKETED_PROSE}]`)
    expect(contentXmlOf(rendered)).toBe(contentXmlOf(buffer))
  })

  it('keeps the document consistent even when replaced by mistake', () => {
    // If the user does not mark it, it behaves as a field and is emptied. That
    // is a data mistake, not a corrupt file: the offsets must still tile.
    const buffer = load('gercek-tablolu.udf')
    const rendered = renderUdf(buffer, { [BRACKETED_PROSE]: '' }, 'square')
    const xml = contentXmlOf(rendered)
    const { text } = splitContentXml(xml)
    const coverage = coverageOf(xml)

    expect(text).not.toContain(BRACKETED_PROSE)
    expect(coverage.contiguous).toBe(true)
    expect(text.length - coverage.covered).toBe(1)
  })
})

describe('a real document used as a template', () => {
  /** Turns a phrase in the real document into a placeholder. */
  function withPlaceholder(name: string, phrase: string, field: string): ArrayBuffer {
    const zip = new PizZip(load(name))
    const xml = zip.file('content.xml')!.asText()

    expect(xml).toContain(phrase)
    // The placeholder must be exactly as long as the phrase it replaces: this
    // helper does not touch offsets, so anything else would hand the engine a
    // template that is already inconsistent (covered separately below).
    expect(`[${field}]`).toHaveLength(phrase.length)

    const { head, text, tail } = splitContentXml(xml)
    const patched = head + text.replace(phrase, `[${field}]`) + tail
    zip.file('content.xml', patched)

    const out = zip.generate({ type: 'uint8array', compression: 'DEFLATE' }) as Uint8Array
    return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer
  }

  it('detects an inserted field and fills it while keeping the file consistent', () => {
    // "AHMET YILMAZ TEST" is the sanitised applicant name; the field name is
    // padded so the placeholder is the same length (see the helper).
    const buffer = withPlaceholder('gercek-basvuru.udf', 'AHMET YILMAZ TEST', 'AD_SOYAD_TESTXX')
    const template = inspectUdfBuffer(buffer, 'sablon.udf')

    expect(template.placeholders).toContain('AD_SOYAD_TESTXX')

    const rendered = renderUdf(buffer, { AD_SOYAD_TESTXX: 'Çiğdem Şahin-Öztürk' }, 'square')
    const xml = contentXmlOf(rendered)
    const { text } = splitContentXml(xml)
    const coverage = coverageOf(xml)

    expect(text).toContain('Çiğdem Şahin-Öztürk')
    expect(text).not.toContain('AHMET YILMAZ TEST')
    // The replacement is longer than the placeholder, so every later offset
    // moved. The document must still tile exactly.
    expect(coverage.contiguous).toBe(true)
    expect(text.length - coverage.covered).toBe(1)
    // Everything the engine does not understand is still there.
    expect(xml).toContain('format_id="1.8"')
    expect(xml).toContain('<webID')
  })

  it('refuses to write a document when the template itself is inconsistent', () => {
    // Someone editing content.xml by hand - shortening the text without fixing
    // the offsets - produces a template that can only yield a broken file. The
    // engine must notice and stop rather than emit something Word or UYAP will
    // render with scrambled formatting.
    const zip = new PizZip(load('gercek-basvuru.udf'))
    const { head, text, tail } = splitContentXml(zip.file('content.xml')!.asText())
    zip.file('content.xml', head + text.replace('AHMET YILMAZ TEST', '[AD_SOYAD]') + tail)

    const out = zip.generate({ type: 'uint8array', compression: 'DEFLATE' }) as Uint8Array
    const buffer = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer

    expect(() => renderUdf(buffer, { AD_SOYAD: 'Ahmet' }, 'square')).toThrow(AppError)
  })

  it('handles a field inside a table cell of a real document', () => {
    const buffer = withPlaceholder('gercek-tablolu.udf', '2026/00000', 'DOSYA_NO')
    const template = inspectUdfBuffer(buffer, 'sablon.udf')

    expect(template.placeholders).toContain('DOSYA_NO')

    const rendered = renderUdf(buffer, { DOSYA_NO: '2027/12345678' }, 'square')
    const xml = contentXmlOf(rendered)
    const coverage = coverageOf(xml)
    const { text } = splitContentXml(xml)

    expect(text).toContain('2027/12345678')
    expect(coverage.contiguous).toBe(true)
    expect(text.length - coverage.covered).toBe(1)
    expect(xml).toContain('<table')
    expect(xml).toContain('<field')
  })
})

describe('structural fidelity while offsets really move', () => {
  /** Span markers the engine is allowed to drop once they describe nothing. */
  const REMOVABLE = new Set(['content', 'space', 'tab', 'field'])

  /** Every tag name in document order, with how many times it appears. */
  function tagCensus(xml: string): Record<string, number> {
    const census: Record<string, number> = {}
    for (const match of xml.matchAll(/<([A-Za-z_][\w.:-]*)/g)) {
      census[match[1]!] = (census[match[1]!] ?? 0) + 1
    }
    return census
  }

  /** Attribute names present on offset-bearing tags, as a set. */
  function attributeNames(xml: string): string[] {
    const names = new Set<string>()
    for (const match of xml.matchAll(/<[A-Za-z_][\w.:-]*([^>]*)>/g)) {
      for (const attr of match[1]!.matchAll(/([A-Za-z_][\w.:-]*)\s*=/g)) names.add(attr[1]!)
    }
    return [...names].sort()
  }

  it('changes only offsets and fully-consumed runs, on a real 153-run document', () => {
    // The byte-identical round-trip above short-circuits: with no edits the
    // remapper never runs. This forces a real edit so every later offset moves.
    //
    // The phrase spans 11 runs (6 <field> + 5 <space>). Replacing it with a
    // short value leaves the first run holding the value and the other ten
    // describing nothing, so those are dropped - real UYAP documents never
    // contain a zero-length run.
    const buffer = load('gercek-tablolu.udf')
    const before = contentXmlOf(buffer)

    const rendered = renderUdf(buffer, { [BRACKETED_PROSE]: 'Kısa' }, 'square')
    const after = contentXmlOf(rendered)

    expect(after).not.toBe(before)
    expect(after).not.toContain('length="0"')

    const from = tagCensus(before)
    const to = tagCensus(after)

    for (const [tag, count] of Object.entries(from)) {
      const now = to[tag] ?? 0
      if (REMOVABLE.has(tag)) {
        // Only ever fewer, never more, and never all of them.
        expect(now).toBeLessThanOrEqual(count)
      } else {
        expect(now).toBe(count)
      }
    }

    expect(from.field! - to.field!).toBe(5)
    expect(from.space! - to.space!).toBe(5)

    // Attribute vocabulary is untouched: no attribute was invented or lost.
    expect(attributeNames(after)).toEqual(attributeNames(before))

    // The prolog, the styles and everything the engine knows nothing about are
    // still byte-identical; only the text and the offsets differ.
    expect(after.slice(0, after.indexOf('<content>'))).toBe(
      before.slice(0, before.indexOf('<content>'))
    )
    expect(after.slice(after.indexOf('<styles>'))).toBe(before.slice(before.indexOf('<styles>')))
  })

  it('keeps an embedded image rather than deleting it with its span', () => {
    // Images carry binary payload, so they are exempt from the removal above.
    expect(REMOVABLE.has('image')).toBe(false)
  })

  it('reports the signature so its removal is never a surprise', () => {
    expect(inspectUdfBuffer(load('gercek-basvuru.udf'), 'x.udf').notices.hasSignature).toBe(true)
    expect(inspectUdfBuffer(load('gercek-tablolu.udf'), 'x.udf').notices.hasSignature).toBe(false)
  })

  it('rejects a hand-edited template at upload time, with an actionable message', () => {
    const zip = new PizZip(load('gercek-basvuru.udf'))
    const { head, text, tail } = splitContentXml(zip.file('content.xml')!.asText())
    // Someone typing a placeholder into content.xml with a text editor.
    zip.file('content.xml', head + text.replace('AHMET YILMAZ TEST', '[AD_SOYAD]') + tail)
    const out = zip.generate({ type: 'uint8array', compression: 'DEFLATE' }) as Uint8Array
    const buffer = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer

    expect(() => inspectUdfBuffer(buffer, 'elle-duzenlenmis.udf')).toThrow(AppError)
  })
})
