import PizZip from 'pizzip'
import type { GeneratedDocument } from '~/types'
import { AppError } from '~/utils/errors'

/** Named with a leading underscore so it sorts to the top of the archive. */
export const REPORT_ENTRY = '_RAPOR.txt'

/** PizZip already ships with docxtemplater, so no separate ZIP library is needed. */
export function buildZip(documents: GeneratedDocument[], report?: string): Blob {
  try {
    const zip = new PizZip()
    for (const document of documents) {
      zip.file(document.fileName, document.data)
    }

    if (report) zip.file(REPORT_ENTRY, report)

    return zip.generate({ type: 'blob', compression: 'DEFLATE' }) as Blob
  } catch (error) {
    throw new AppError(
      'ZIP_FAILED',
      'Belgeler ZIP dosyasına paketlenemedi.',
      error instanceof Error ? error.message : undefined
    )
  }
}
