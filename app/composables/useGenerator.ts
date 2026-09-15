import { computed, ref } from 'vue'
import type { ExcelData, SkippedRow, TemplateData } from '~/types'
import { AppError } from '~/utils/errors'
import { inspectTemplate } from '~/utils/template'
import { readExcel } from '~/utils/excel'
import { validate } from '~/utils/validation'
import { buildReport, generateDocuments } from '~/utils/generate'
import { buildZip } from '~/utils/zip'
import { downloadBlob } from '~/utils/download'

export const ZIP_NAME = 'dilekceler.zip'

export interface FieldError {
  message: string
  detail?: string
}

function toFieldError(error: unknown, fallback: string): FieldError {
  if (error instanceof AppError) return { message: error.message, detail: error.detail }
  return { message: fallback, detail: error instanceof Error ? error.message : undefined }
}

/** Owns all application state; components stay presentational. */
export function useGenerator() {
  const template = ref<TemplateData | null>(null)
  const excel = ref<ExcelData | null>(null)
  const templateError = ref<FieldError | null>(null)
  const excelError = ref<FieldError | null>(null)

  const status = ref<'idle' | 'working' | 'done'>('idle')
  const processed = ref(0)
  const generationError = ref<FieldError | null>(null)
  const archive = ref<Blob | null>(null)
  const documentCount = ref(0)
  const skippedRows = ref<SkippedRow[]>([])

  /** Placeholders the user marked as ordinary text rather than fields. */
  const ignoredFields = ref<string[]>([])
  let abortController: AbortController | null = null

  const validation = computed(() =>
    template.value && excel.value
      ? validate(template.value, excel.value, new Set(ignoredFields.value))
      : null
  )

  /**
   * Documents and the ZIP exist in memory at the same time, so the peak is
   * roughly template size x rows x 2. Estimated up front from two known
   * numbers - no guessing - so a doomed batch can be warned about first.
   */
  const memoryEstimateMb = computed(() => {
    if (!template.value || !excel.value) return 0
    return (template.value.buffer.byteLength * excel.value.rows.length * 2) / 1048576
  })

  const memoryWarning = computed(() => memoryEstimateMb.value > 400)

  function toggleIgnored(field: string) {
    clearResult()
    ignoredFields.value = ignoredFields.value.includes(field)
      ? ignoredFields.value.filter((name) => name !== field)
      : [...ignoredFields.value, field]
  }

  const canGenerate = computed(() => validation.value?.ok === true && status.value !== 'working')

  const progress = computed(() => {
    const total = excel.value?.rows.length ?? 0
    return total === 0 ? 0 : Math.round((processed.value / total) * 100)
  })

  /** A new input invalidates any archive produced from the previous one. */
  function clearResult() {
    status.value = 'idle'
    processed.value = 0
    archive.value = null
    documentCount.value = 0
    generationError.value = null
    skippedRows.value = []
  }

  async function selectTemplate(file: File) {
    clearResult()
    templateError.value = null
    template.value = null
    // A new template has a different field set; old marks no longer apply.
    ignoredFields.value = []

    try {
      template.value = await inspectTemplate(file)
    } catch (error) {
      templateError.value = toFieldError(error, 'Word şablonu yüklenemedi.')
    }
  }

  async function selectExcel(file: File) {
    clearResult()
    excelError.value = null
    excel.value = null

    try {
      excel.value = await readExcel(file)
    } catch (error) {
      excelError.value = toFieldError(error, 'Excel dosyası yüklenemedi.')
    }
  }

  async function generate() {
    if (!template.value || !excel.value || !canGenerate.value) return

    status.value = 'working'
    processed.value = 0
    generationError.value = null
    archive.value = null

    abortController = new AbortController()

    try {
      const result = await generateDocuments(template.value, excel.value, {
        ignoredFields: new Set(ignoredFields.value),
        signal: abortController.signal,
        onProgress: (completed) => {
          processed.value = completed
        }
      })

      // The report always travels inside the archive, so a user opening it
      // days later can still see what was left out and why.
      archive.value = buildZip(result.documents, buildReport(template.value, excel.value, result))
      documentCount.value = result.documents.length
      skippedRows.value = result.skipped
      status.value = 'done'
    } catch (error) {
      generationError.value = toFieldError(error, 'Belgeler oluşturulamadı.')
      status.value = 'idle'
    } finally {
      abortController = null
    }
  }

  function cancel() {
    abortController?.abort()
  }

  function download() {
    if (archive.value) downloadBlob(archive.value, ZIP_NAME)
  }

  return {
    template,
    excel,
    templateError,
    excelError,
    validation,
    canGenerate,
    status,
    progress,
    processed,
    documentCount,
    generationError,
    archive,
    skippedRows,
    ignoredFields,
    toggleIgnored,
    memoryEstimateMb,
    memoryWarning,
    cancel,
    selectTemplate,
    selectExcel,
    generate,
    download
  }
}
