/**
 * Builds a synthetic .udf fixture that mirrors what real UYAP output looks like.
 *
 * The structure here follows an analysis of real UYAP-produced documents:
 *  - format_id is 1.8
 *  - the XML prolog carries a trailing space and a blank line
 *  - the whole document text lives in ONE CDATA block
 *  - every element indexes into it by character offset, with no gaps or overlaps
 *  - each paragraph's own trailing newline is INSIDE its covered range
 *  - the CDATA ends with exactly one extra newline that no element covers
 *  - words can be split by <space>/<tab> runs, and table cells point into the
 *    same text pool as top-level paragraphs
 *
 * Offsets are COMPUTED from the segments below rather than written by hand,
 * because keeping them consistent is exactly what the UDF engine has to do.
 * The fixture bakes in the cases most likely to break it:
 *  - a placeholder split across two runs with different formatting
 *  - a placeholder split by a <space> run
 *  - the same placeholder used twice in one paragraph
 *  - a placeholder inside a table cell
 *  - Turkish characters around the placeholders
 *  - a literal "[Madde 5]" that looks exactly like a field
 *  - an unbalanced "[" that must survive untouched
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import PizZip from 'pizzip'
import writeXlsxFile from 'write-excel-file/node'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(here, '../tests/fixtures')
mkdirSync(outDir, { recursive: true })

const NEWLINE = '\n'
const TAB = '\t'

let text = ''

/** Emits one run and appends its characters to the shared text pool. */
function run(tag, chunk, attributes = '') {
  const element = `<${tag}${attributes} startOffset="${text.length}" length="${chunk.length}"/>`
  text += chunk
  return element
}

/** A paragraph whose last run carries the paragraph's own newline. */
function paragraph(segments, paragraphAttributes = '') {
  const runs = segments.map((segment, index) => {
    const chunk = index === segments.length - 1 ? segment.text + NEWLINE : segment.text
    return run(segment.tag ?? 'content', chunk, segment.attributes ?? '')
  })

  return `<paragraph${paragraphAttributes}>${runs.join('')}</paragraph>`
}

const body = []

// Placeholder split across two bold runs, the way a mid-word format change
// splits it in a real editor.
body.push(
  paragraph(
    [
      { text: 'Sayın ' },
      { text: '[AD_', attributes: ' bold="true"' },
      { text: 'SOYAD]', attributes: ' bold="true"' },
      { text: ', başvurunuz alınmıştır.' }
    ],
    ' Alignment="0"'
  )
)

// A <tab> run between label and value, as UYAP writes form-style lines.
body.push(
  paragraph([
    { text: 'T.C. Kimlik No:' },
    { text: TAB, tag: 'tab' },
    { text: '[TC_KIMLIK]' }
  ])
)

// The same placeholder twice in one paragraph.
body.push(paragraph([{ text: 'Adres: [ADRES] - Şehir: [ADRES]' }]))

// A placeholder split by a <space> run: "[Madde 5]" becomes three runs.
body.push(
  paragraph([
    { text: 'İlgili mevzuat [Madde' },
    { text: ' ', tag: 'space' },
    { text: '5] hükmü uyarınca değerlendirilmiştir.' }
  ])
)

// An unbalanced bracket that is not a field and must be left alone.
body.push(paragraph([{ text: 'Ödeme tutarı 1.500 TL [KDV dahil değildir.' }]))

body.push(paragraph([{ text: 'ÇŞĞÜÖİı karakter testi' }]))

// An empty paragraph is a single run covering just its newline.
body.push(paragraph([{ text: '' }]))

// A table whose cells index into the very same text pool.
const cells = [
  `<cell>${paragraph([{ text: 'Tarih' }])}</cell>`,
  `<cell>${paragraph([{ text: '[TARIH]' }])}</cell>`
]
body.push(
  `<table tableName="Sabit" columnCount="2" columnSpans="100,100" border="borderCell">` +
    `<row rowName="row1" rowType="dataRow">${cells.join('')}</row>` +
    `</table>`
)

// Real documents end with one newline that no element covers - the Swing
// StyledDocument terminator.
const documentText = text + NEWLINE

const contentXml =
  '<?xml version="1.0" encoding="UTF-8" ?> \n\n' +
  '<template format_id="1.8" >\n' +
  '<content><![CDATA[' +
  documentText +
  ']]></content>\n' +
  '<properties><pageFormat mediaSizeName="1" leftMargin="70.875" rightMargin="70.875" topMargin="70.875" bottomMargin="70.875" paperOrientation="1" headerFOffset="20.0" footerFOffset="20.0" /></properties>\n' +
  '<elements resolver="hvl-default" >\n' +
  body.join('\n') +
  '\n</elements>\n' +
  '<styles><style name="default" description="Geçerli" family="Dialog" size="12" bold="false" italic="false" foreground="-13421773" /><style name="hvl-default" family="Times New Roman" size="12" description="Gövde" /></styles>\n' +
  '</template>'

const documentProperties =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<!DOCTYPE properties SYSTEM "http://java.sun.com/dtd/properties.dtd">\n' +
  '<properties>\n' +
  '<entry key="uyapdogrulamakodu">TESTKODU</entry>\n' +
  '</properties>'

const zip = new PizZip()
zip.file('content.xml', contentXml)
zip.file('documentproperties.xml', documentProperties)
// A stand-in signature: the engine must drop this, because a signature over the
// original bytes cannot stay valid once the text is replaced.
zip.file('sign.sgn', 'SAHTE-IMZA-VERISI')

const target = resolve(outDir, 'sablon.udf')
writeFileSync(target, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }))

console.log('UDF fixture written to', target)
console.log('  text length:', documentText.length, '| covered:', text.length)

// ---------------------------------------------------------------------------
// A template derived from the real UYAP document, the way UYAP Editör would
// produce one: the placeholders are exactly as long as the text they replace,
// so the donor file's offsets stay valid. Editing a .udf any other way outside
// the editor desynchronises them - which the engine detects and refuses.
// ---------------------------------------------------------------------------

const donorPath = resolve(outDir, 'gercek-basvuru.udf')

if (existsSync(donorPath)) {
  const donor = new PizZip(readFileSync(donorPath))
  const donorXml = donor.file('content.xml').asText()

  const cdata = /(<content\b[^>]*>\s*<!\[CDATA\[)([\s\S]*?)(]]>)/.exec(donorXml)
  let donorText = cdata[2]

  const swaps = [
    ['AHMET YILMAZ TEST', '[AD_SOYAD_TESTXX]'],
    ['0500 000 00 00', '[TELEFON_XXXX]']
  ]

  for (const [from, to] of swaps) {
    if (from.length !== to.length) throw new Error(`Uzunluk esit degil: ${from} -> ${to}`)
    if (!donorText.includes(from)) throw new Error(`Kaynak metinde bulunamadi: ${from}`)
    donorText = donorText.replace(from, to)
  }

  const patched =
    donorXml.slice(0, cdata.index) +
    cdata[1] +
    donorText +
    cdata[3] +
    donorXml.slice(cdata.index + cdata[0].length)

  donor.file('content.xml', patched)
  // The signature cannot survive templating, so the fixture does not carry one.
  donor.remove('sign.sgn')

  writeFileSync(
    resolve(outDir, 'uyap-sablon.udf'),
    donor.generate({ type: 'nodebuffer', compression: 'DEFLATE' })
  )
  console.log('UYAP-derived template written to', resolve(outDir, 'uyap-sablon.udf'))
} else {
  console.log('gercek-basvuru.udf yok, UYAP tureviden sablon atlandi')
}

// The list that pairs with the derived template above, so `npm run fixtures`
// reproduces everything the test suite needs from a clean checkout.
await writeXlsxFile(
  [
    ['AD_SOYAD_TESTXX', 'TELEFON_XXXX'].map((value) => ({ value, type: String })),
    ...[
      ['Çiğdem Şahin-Öztürk', '0532 111 22 33'],
      ['Mehmet Kaya', '0555 444 55 66'],
      ['İbrahim Ağaoğlu', '0543 777 88 99']
    ].map((row) => row.map((value) => ({ value, type: String })))
  ],
  { filePath: resolve(outDir, 'uyap-liste.xlsx') }
)

console.log('UYAP list written to', resolve(outDir, 'uyap-liste.xlsx'))
