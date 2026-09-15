import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import InspectModule from 'docxtemplater/js/inspect-module.js'
import type { ExcelRow, IgnoredFields, PlaceholderSyntax, TemplateData } from '~/types'
import { AppError } from '~/utils/errors'

/**
 * Custom delimiters are what make docxtemplater rebuild placeholders that Word
 * split across several XML runs, while leaving every other byte of the document
 * — styles, tables, images, headers, footers — untouched.
 *
 * Two styles are supported. Double braces are unambiguous: they do not occur in
 * ordinary legal prose. Square brackets do ("[Madde 5]"), so a template using
 * them relies on the user marking which bracketed text is really a field.
 */
const DELIMITERS: Record<PlaceholderSyntax, { start: string; end: string }> = {
  curly: { start: '{{', end: '}}' },
  square: { start: '[', end: ']' }
}

/**
 * Real petitions contain lone brackets in body text. Allowing them keeps such
 * templates working; they are copied through verbatim instead of throwing.
 */
const SYNTAX = { allowUnopenedTag: true, allowUnclosedTag: true }

interface DocxtemplaterError extends Error {
  properties?: {
    id?: string
    explanation?: string
    errors?: DocxtemplaterError[]
  }
}

function describeSyntaxError(error: DocxtemplaterError): string {
  const nested = error.properties?.errors ?? []
  const explanations = nested
    .map((item) => item.properties?.explanation || item.message)
    .filter((text): text is string => Boolean(text))

  return explanations.length > 0 ? explanations.join(' • ') : error.message
}

function openZip(buffer: ArrayBuffer): PizZip {
  let zip: PizZip
  try {
    zip = new PizZip(buffer)
  } catch {
    throw new AppError(
      'TEMPLATE_UNREADABLE',
      'Word şablonu okunamadı. Dosya bozuk olabilir.',
      'Şablonu Word’de açıp “Farklı Kaydet → .docx” ile yeniden kaydetmeyi deneyin.'
    )
  }

  if (!zip.file('word/document.xml')) {
    throw new AppError(
      'TEMPLATE_NOT_DOCX',
      'Bu dosya geçerli bir Word (.docx) belgesi değil.'
    )
  }

  return zip
}

function createDocument(
  buffer: ArrayBuffer,
  syntax: PlaceholderSyntax,
  modules: unknown[] = []
): Docxtemplater {
  try {
    return new Docxtemplater(openZip(buffer), {
      delimiters: DELIMITERS[syntax],
      syntax: SYNTAX,
      paragraphLoop: true,
      linebreaks: true,
      // Empty Excel cells become empty text rather than the string "undefined".
      nullGetter: () => '',
      errorLogging: false,
      modules: modules as never[]
    })
  } catch (error) {
    if (error instanceof AppError) throw error
    throw new AppError(
      'TEMPLATE_SYNTAX',
      'Word şablonundaki alanlar okunamadı.',
      describeSyntaxError(error as DocxtemplaterError)
    )
  }
}

/** Parses once with the given style and lists the tags it found. */
function tagsFor(buffer: ArrayBuffer, syntax: PlaceholderSyntax): string[] {
  const inspector = new InspectModule()
  createDocument(buffer, syntax, [inspector])

  // getAllTags() spans document.xml plus every header and footer part.
  return Object.keys(inspector.getAllTags())
}

/**
 * Lists every placeholder in a DOCX template already loaded into memory.
 *
 * The template is parsed with both delimiter styles and double braces win if
 * they produced any field at all. Parsing twice costs nothing here: it happens
 * once per upload, never per generated document.
 */
export function inspectDocxBuffer(buffer: ArrayBuffer, fileName: string): TemplateData {
  const curly = tagsFor(buffer, 'curly')
  const syntax: PlaceholderSyntax = curly.length > 0 ? 'curly' : 'square'

  return {
    fileName,
    format: 'docx',
    syntax,
    notices: { hasSignature: false },
    buffer,
    placeholders: syntax === 'curly' ? curly : tagsFor(buffer, 'square')
  }
}

/**
 * Rebuilds the literal a placeholder was written as, so an ignored field comes
 * out of the renderer looking exactly like the plain text the user meant.
 */
function literalFor(name: string, syntax: PlaceholderSyntax): string {
  const { start, end } = DELIMITERS[syntax]
  return start + name + end
}

/** Renders one document from a pristine copy of the template. */
export function renderDocx(
  templateBuffer: ArrayBuffer,
  row: ExcelRow,
  syntax: PlaceholderSyntax = 'square',
  ignored?: IgnoredFields
): Uint8Array {
  const doc = createDocument(templateBuffer, syntax)
  const data: ExcelRow = { ...row }

  for (const name of ignored ?? []) {
    data[name] = literalFor(name, syntax)
  }

  try {
    doc.render(data)
  } catch (error) {
    throw new AppError(
      'RENDER_FAILED',
      'Belge oluşturulurken şablon hatası oluştu.',
      describeSyntaxError(error as DocxtemplaterError)
    )
  }

  return doc.getZip().generate({
    type: 'uint8array',
    compression: 'DEFLATE',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  }) as Uint8Array
}
