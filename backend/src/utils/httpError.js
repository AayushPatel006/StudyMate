export class HttpError extends Error {
  /**
   * @param {number} status HTTP status code
   * @param {string} message Human-readable message (safe to show to the user)
   * @param {object} [extra] { code, details }
   */
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = extra.code;
    this.details = extra.details;
  }
}

export const badRequest = (msg, details) => new HttpError(400, msg, { code: 'VALIDATION_ERROR', details });
export const notFound = (msg = 'Not found') => new HttpError(404, msg, { code: 'NOT_FOUND' });
export const unauthorized = (msg = 'Authentication required') => new HttpError(401, msg, { code: 'UNAUTHORIZED' });
