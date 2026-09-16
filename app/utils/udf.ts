import PizZip from 'pizzip'
import type { ExcelRow, IgnoredFields, PlaceholderSyntax, TemplateData } from '~/types'
import { AppError } from '~/utils/errors'

/**
 * UDF (UYAP Doküman Formatı) is a ZIP holding a single `content.xml`. Unlike
 * DOCX, the whole document text lives in one CDATA block and every element
 * points into it by CHARACTER OFFSET:
 *
 *   <content><![CDATA[Sayın [AD_SOYAD], ...]]></content>
 *   <elements><paragraph><content startOffset="6" length="10"/></paragraph>...
 *
 * So replacing a 10-character placeholder with a 12-character value shifts every
 * later offset by two. Rewriting the text without recalculating those offsets
 * produces a file that opens with scrambled or missing formatting, which is why
 * this module remaps every offset instead of doing a plain string replace.
 */

/**
 * Placeholder patterns, matching the DOCX path: never across a line break.
 * Double braces are unambiguous; square brackets also occur as ordinary legal
 * prose, so a square-bracket template relies on the user's ignore list.
 */
const PLACEHOLDERS: Record<PlaceholderSyntax, string> = {
  curly: '\\{\\{([^{}\\r\\n]+)\\}\\}',
  square: '\\[([^[\\]\\r\\n]+)\\]'
}

/** A fresh regex per call: a shared global regex would carry lastIndex. */
function pattern(syntax: PlaceholderSyntax): RegExp {
  return new RegExp(PLACEHOLDERS[syntax], 'g')
}

/** Matches the text container, not the `<content startOffset=.../>` run markers. */
const CDATA_BLOCK = /(<content\b[^>]*>)\s*<!\[CDATA\[([\s\S]*?)]]>\s*(<\/content>)/

/** Any tag carrying an offset pair; rewritten in place, attributes untouched. */
const OFFSET_TAG = /<([A-Za-z_][\w.:-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g

/** XML 1.0 forbids these even inside CDATA, so they are dropped from values. */
const FORBIDDEN_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g

/**
 * An electronic signature covers the original bytes. Once the text has been
 * replaced it cannot still be valid, so the entry is dropped rather than
 * shipped alongside content it no longer matches.
 */
const SIGNATURE_ENTRY = 'sign.sgn'

/**
 * The only way to carry the CDATA terminator inside a CDATA block: close it and
 * reopen after the bracket. Both forms decode to the same three characters, so
 * offsets are computed on the decoded text and this escaping only affects how
 * the text is serialised.
 */
const CDATA_TERMINATOR = ']]' + '>'
const CDATA_ESCAPE = ']]]]><![CDATA[>'

/**
 * Inline, self-closing elements that mark a span of text and carry nothing but
 * styling for it. When a replacement consumes such a span entirely the element
 * describes nothing, and real UYAP documents contain no zero-length runs, so it
 * is dropped rather than left behind pointing at an empty range.
 *
 * `image` is deliberately absent: it carries embedded binary data, and silently
 * deleting a picture is a worse surprise than an empty marker.
 */
const REMOVABLE_SPAN_TAGS = new Set(['content', 'space', 'tab', 'field'])

/**
 * A newline inside a value would desync the paragraph model, whose boundaries
 * are newlines in the shared text. Values are therefore flattened to one line.
 */
const VALUE_NEWLINE_REPLACEMENT = ' '

interface OffsetEdit {
  start: number
  end: number
  newLength: number
}

interface ContentXml {
  /** Everything before the document text, including the opening tag. */
  head: string
  text: string
  /** Everything after the document text, including the closing tag. */
  tail: string
}

/** Locates the `content.xml` entry whatever case the producer used. */
function findContentEntry(zip: PizZip): string {
  const match = Object.keys(zip.files).find((name) => name.toLowerCase() === 'content.xml')

  if (!match) {
    throw new AppError(
      'TEMPLATE_NOT_UDF',
      'Bu dosya geçerli bir UYAP belgesi (.udf) değil.',
      'Arşivin içinde content.xml bulunamadı.'
    )
  }

  return match
}

function openUdf(buffer: ArrayBuffer): PizZip {
  try {
    return new PizZip(buffer)
  } catch {
    throw new AppError(
      'TEMPLATE_UNREADABLE',
      'UDF şablonu okunamadı. Dosya bozuk olabilir.',
      'Şablonu UYAP Editör ile açıp yeniden kaydetmeyi deneyin.'
    )
  }
}

export function splitContentXml(xml: string): ContentXml {
  const match = CDATA_BLOCK.exec(xml)

  if (!match) {
    throw new AppError(
      'TEMPLATE_NOT_UDF',
      'UDF şablonunun metin bölümü bulunamadı.',
      'content.xml içinde CDATA taşıyan <content> etiketi yok.'
    )
  }

  const [whole, openTag, text, closeTag] = match
  const start = match.index

  return {
    head: xml.slice(0, start) + openTag + '<![CDATA[',
    text: unescapeCdata(text!),
    tail: ']]>' + closeTag + xml.slice(start + whole.length)
  }
}

export function detectPlaceholders(text: string, syntax: PlaceholderSyntax = 'square'): string[] {
  const names = new Set<string>()

  for (const match of text.matchAll(pattern(syntax))) {
    names.add(match[1]!)
  }

  return [...names]
}

/** Double braces win whenever the template uses them at all. */
export function detectSyntax(text: string): PlaceholderSyntax {
  return pattern('curly').test(text) ? 'curly' : 'square'
}

/** Decoded text -> CDATA payload. The value itself is never altered. */
export function escapeCdata(text: string): string {
  return text.split(CDATA_TERMINATOR).join(CDATA_ESCAPE)
}

/** CDATA payload -> decoded text, so offsets count real characters. */
export function unescapeCdata(payload: string): string {
  return payload.split(CDATA_ESCAPE).join(CDATA_TERMINATOR)
}

function sanitiseValue(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/\n/g, VALUE_NEWLINE_REPLACEMENT)
    .replace(FORBIDDEN_XML_CHARS, '')
}

/** Replaces placeholders and records what each edit did to the text length. */
export function applyReplacements(
  text: string,
  row: ExcelRow,
  syntax: PlaceholderSyntax = 'square',
  ignored?: IgnoredFields
): { text: string; edits: OffsetEdit[] } {
  const edits: OffsetEdit[] = []
  let output = ''
  let copiedUpTo = 0

  for (const match of text.matchAll(pattern(syntax))) {
    const whole = match[0]
    const name = match[1]!

    // An ignored placeholder is ordinary text: no edit, no offset shift, the
    // original characters survive byte for byte.
    if (ignored?.has(name)) continue

    const start = match.index
    const end = start + whole.length
    const value = sanitiseValue(row[name] ?? '')

    output += text.slice(copiedUpTo, start) + value
    edits.push({ start, end, newLength: value.length })
    copiedUpTo = end
  }

  return { text: output + text.slice(copiedUpTo), edits }
}

/**
 * Translates an offset in the original text to its position in the new text.
 * A position that fell *inside* a replaced placeholder collapses to the end of
 * the inserted value, so the run that started before the placeholder absorbs it
 * and any run that started inside it becomes empty rather than overlapping.
 */
export function mapOffset(position: number, edits: OffsetEdit[]): number {
  let delta = 0

  for (const edit of edits) {
    if (edit.end <= position) {
      delta += edit.newLength - (edit.end - edit.start)
      continue
    }

    if (edit.start >= position) break

    return edit.start + delta + edit.newLength
  }

  return position + delta
}

/**
 * Rewrites startOffset/length on every element that carries them, anywhere in
 * the tree - table cells point into the same text pool as top-level paragraphs.
 * Nothing is restructured: only the two numbers change, so anything this code
 * does not understand (tables, images, fields) survives untouched.
 *
 * The one exception is a run that a replacement consumed entirely. Real UYAP
 * documents never contain zero-length runs, so those are dropped instead of
 * left behind as empty markers.
 */
export function remapOffsets(xmlChunk: string, edits: OffsetEdit[]): string {
  if (edits.length === 0) return xmlChunk

  return xmlChunk.replace(OFFSET_TAG, (tag, name: string, attributes: string, selfClose: string) => {
    const startMatch = /\bstartOffset\s*=\s*"(\d+)"/.exec(attributes)
    const lengthMatch = /\blength\s*=\s*"(\d+)"/.exec(attributes)

    if (!startMatch || !lengthMatch) return tag

    const oldStart = Number(startMatch[1])
    const oldLength = Number(lengthMatch[1])

    const newStart = mapOffset(oldStart, edits)
    const newEnd = mapOffset(oldStart + oldLength, edits)
    const newLength = Math.max(0, newEnd - newStart)

    if (newLength === 0 && oldLength > 0 && selfClose === '/' && REMOVABLE_SPAN_TAGS.has(name)) {
      return ''
    }

    const rewritten = attributes
      .replace(/\bstartOffset\s*=\s*"\d+"/, `startOffset="${newStart}"`)
      .replace(/\blength\s*=\s*"\d+"/, `length="${newLength}"`)

    return `<${name}${rewritten}${selfClose}>`
  })
}

interface Coverage {
  /** True when runs start at 0 and each begins exactly where the last ended. */
  contiguous: boolean
  covered: number
}

/**
 * Real UYAP documents partition the text: no gaps, no overlaps, and exactly one
 * trailing newline left uncovered - every real fixture in this repository was
 * measured and every one of them does exactly that. Checking this after
 * rendering is the cheapest way to catch a stale offset before a broken file
 * reaches the user.
 *
 * The callers deliberately check less than that: they reject gaps, overlaps and
 * coverage that runs past the end of the text, but accept ANY uncovered tail.
 * Other producers of .udf files - converters, third-party editors - tile the
 * text their own way, and rejecting them would buy nothing: an uncovered tail
 * cannot break a document, while a stale offset can.
 */
export function coverageOf(xmlChunk: string): Coverage {
  let cursor = 0
  let contiguous = true

  for (const match of xmlChunk.matchAll(OFFSET_TAG)) {
    const attributes = match[2]!
    const startMatch = /\bstartOffset\s*=\s*"(\d+)"/.exec(attributes)
    const lengthMatch = /\blength\s*=\s*"(\d+)"/.exec(attributes)

    if (!startMatch || !lengthMatch) continue

    if (Number(startMatch[1]) !== cursor) contiguous = false
    cursor = Number(startMatch[1]) + Number(lengthMatch[1])
  }

  return { contiguous, covered: cursor }
}

export function inspectUdfBuffer(buffer: ArrayBuffer, fileName: string): TemplateData {
  const zip = openUdf(buffer)
  const entry = findContentEntry(zip)
  const xml = zip.file(entry)!.asText()
  const { head, text, tail } = splitContentXml(xml)

  // A template whose offsets already disagree with its text can only produce a
  // broken document. Catching it here, on upload, lets us say what actually
  // went wrong instead of failing later with an arithmetic complaint.
  const coverage = coverageOf(head + tail)
  if (!coverage.contiguous || coverage.covered > text.length) {
    throw new AppError(
      'TEMPLATE_INCONSISTENT',
      'Bu UDF dosyasının biçimlendirme konumları metniyle uyuşmuyor.',
      'Dosya bir metin düzenleyiciyle elle değiştirilmiş olabilir. UYAP Editör ile açıp yeniden kaydedin; alanları da orada yazın.'
    )
  }

  const syntax = detectSyntax(text)
  const hasSignature = Object.keys(zip.files).some(
    (name) => name.toLowerCase() === SIGNATURE_ENTRY
  )

  return {
    fileName,
    format: 'udf',
    syntax,
    notices: { hasSignature },
    buffer,
    placeholders: detectPlaceholders(text, syntax)
  }
}

export function renderUdf(
  templateBuffer: ArrayBuffer,
  row: ExcelRow,
  syntax: PlaceholderSyntax = 'square',
  ignored?: IgnoredFields
): Uint8Array {
  const zip = openUdf(templateBuffer)
  const entry = findContentEntry(zip)
  const { head, text, tail } = splitContentXml(zip.file(entry)!.asText())

  const { text: newText, edits } = applyReplacements(text, row, syntax, ignored)

  // Only the tail normally holds <elements>, but the head is remapped too in
  // case a producer places the element tree before the text.
  const newHead = remapOffsets(head, edits)
  const newTail = remapOffsets(tail, edits)

  const coverage = coverageOf(newHead + newTail)

  if (!coverage.contiguous || coverage.covered > newText.length) {
    throw new AppError(
      'RENDER_FAILED',
      'UDF belgesi tutarsız çıktı, bu yüzden oluşturulmadı.',
      `Biçimlendirme konumları metinle uyuşmuyor (kapsanan ${coverage.covered}, metin ${newText.length}).`
    )
  }

  zip.file(entry, newHead + escapeCdata(newText) + newTail)

  // The signature no longer matches the edited content, so it is not carried
  // over. Every other entry (documentproperties.xml, embedded parts) is kept.
  const signature = Object.keys(zip.files).find(
    (name) => name.toLowerCase() === SIGNATURE_ENTRY
  )
  if (signature) zip.remove(signature)

  return zip.generate({ type: 'uint8array', compression: 'DEFLATE' }) as Uint8Array
}
