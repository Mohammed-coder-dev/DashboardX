export class AppError extends Error {
  constructor(message, { status = 500, code = "internal_error" } = {}) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}

const MULTER_MESSAGES = {
  LIMIT_FILE_SIZE:       { status: 413, code: "file_too_large",   message: "File exceeds the 4 MB upload limit — analyze larger files by pasting a link instead." },
  LIMIT_FILE_COUNT:      { status: 400, code: "too_many_files",   message: "Maximum 10 files allowed." },
  LIMIT_UNEXPECTED_FILE: { status: 400, code: "unexpected_field", message: "Unexpected upload field." },
};

// Maps any thrown value to a stable { status, code, message } shape so
// internals (stack traces, upstream payloads) never reach the client.
export function normalizeError(err) {
  if (err instanceof AppError) {
    return { status: err.status, code: err.code, message: err.message };
  }
  if (err?.name === "MulterError") {
    return MULTER_MESSAGES[err.code] || { status: 400, code: "upload_error", message: "Upload failed." };
  }
  if (err instanceof SyntaxError && err.status === 400) {
    return { status: 400, code: "invalid_json", message: "Request body is not valid JSON." };
  }
  return { status: 500, code: "internal_error", message: "Something went wrong. Please try again." };
}
