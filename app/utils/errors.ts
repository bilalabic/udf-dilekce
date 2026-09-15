export type ErrorCode =
  | 'TEMPLATE_WRONG_EXTENSION'
  | 'TEMPLATE_UNREADABLE'
  | 'TEMPLATE_NOT_DOCX'
  | 'TEMPLATE_NOT_UDF'
  | 'TEMPLATE_INCONSISTENT'
  | 'TEMPLATE_SYNTAX'
  | 'EXCEL_WRONG_EXTENSION'
  | 'EXCEL_UNREADABLE'
  | 'EXCEL_EMPTY'
  | 'EXCEL_NO_HEADERS'
  | 'EXCEL_DUPLICATE_HEADER'
  | 'EXCEL_NO_ROWS'
  | 'RENDER_FAILED'
  | 'GENERATION_CANCELLED'
  | 'ZIP_FAILED'

/**
 * Errors carry a code plus already-localised detail, so utils stay free of UI
 * concerns while the interface can still show a precise Turkish message.
 */
export class AppError extends Error {
  readonly code: ErrorCode
  readonly detail?: string

  constructor(code: ErrorCode, message: string, detail?: string) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.detail = detail
  }
}

export function toAppError(error: unknown, fallback: AppError): AppError {
  return error instanceof AppError ? error : fallback
}
