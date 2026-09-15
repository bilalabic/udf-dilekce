import { describe, expect, it, vi } from 'vitest'
import type { ExcelData, TemplateData } from '~/types'

// renderTemplate is mocked so a row failure can be provoked deterministically.
// Template-level errors surface at compile time and would fail every row; what
// needs proving here is that ONE bad row does not destroy the whole batch.
vi.mock('~/utils/template', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/utils/template')>()

  return {
    ...actual,
    renderTemplate: vi.fn((_template: TemplateData, row: Record<string, string>) => {
      if (row.AD_SOYAD === 'PATLAT') throw new Error('bozuk satir')
      return new Uint8Array([1, 2, 3])
    })
  }
})

const { generateDocuments, buildReport } = await import('~/utils/generate')
const { AppError } = await import('~/utils/errors')

function template(): TemplateData {
  return {
    fileName: 'sablon.docx',
    format: 'docx',
    syntax: 'square',
    notices: { hasSignature: false },
    buffer: new ArrayBuffer(0),
    placeholders: ['AD_SOYAD']
  }
}

function excel(names: string[]): ExcelData {
  return {
    fileName: 'liste.xlsx',
    headers: ['AD_SOYAD'],
    rows: names.map((AD_SOYAD) => ({ AD_SOYAD })),
    notices: { sheetName: 'Sayfa 1', sheetCount: 1, skippedEmptyRows: 0, reformattedDateCells: 0 }
  }
}

describe('a failing row', () => {
  it('does not destroy the documents built before it', async () => {
    const { documents, skipped } = await generateDocuments(
      template(),
      excel(['Ahmet', 'PATLAT', 'Mehmet', 'Ayşe'])
    )

    expect(documents).toHaveLength(3)
    expect(skipped).toHaveLength(1)
  })

  it('reports the row number the user sees in Excel', async () => {
    // Data row 2 lives on Excel row 3, because the header occupies row 1.
    const { skipped } = await generateDocuments(template(), excel(['Ahmet', 'PATLAT']))

    expect(skipped[0]).toEqual({ excelRow: 3, reason: 'Error: bozuk satir' })
  })

  it('keeps the surviving documents numbered by their own row', async () => {
    const { documents } = await generateDocuments(template(), excel(['Ahmet', 'PATLAT', 'Mehmet']))

    expect(documents.map((d) => d.fileName)).toEqual([
      'Dilekce_001_Ahmet.docx',
      'Dilekce_003_Mehmet.docx'
    ])
  })

  it('fails loudly when every row fails, instead of shipping an empty ZIP', async () => {
    await expect(generateDocuments(template(), excel(['PATLAT', 'PATLAT']))).rejects.toThrow(
      AppError
    )
  })

  it('names the failure in the report that goes into the archive', async () => {
    const data = excel(['Ahmet', 'PATLAT'])
    const result = await generateDocuments(template(), data)
    const report = buildReport(template(), data, result)

    expect(report).toContain('Atlanan satir    : 1')
    expect(report).toContain('Excel satir 3')
    expect(report).toContain('URETILMEDI')
  })
})

describe('cancellation', () => {
  it('stops part-way and keeps nothing', async () => {
    const controller = new AbortController()
    const names = Array.from({ length: 40 }, (_, i) => `Kisi${i}`)

    const promise = generateDocuments(template(), excel(names), {
      chunkSize: 2,
      signal: controller.signal,
      onProgress: (completed) => {
        if (completed === 4) controller.abort()
      }
    })

    await expect(promise).rejects.toThrow(AppError)
  })
})
