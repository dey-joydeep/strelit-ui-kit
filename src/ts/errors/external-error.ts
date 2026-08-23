/**
 * Provides external error behavior.
 * @public
 */
export abstract class ExternalError extends Error {
  /** @internal */
  constructor(
    /** The stable error category. */
    public readonly type: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Provides configuration error behavior.
 * @public
 */
export class ConfigurationError extends ExternalError {
  /** Prevents unsupported direct construction. @public */
  constructor(_nonConstructible: never, ..._args: never[]);
  /** @internal */
  constructor(message: string, node?: string);
  /** @internal */
  constructor(
    message: string,
    /** The configuration fragment associated with the error, when available. */
    public readonly node?: string,
  ) {
    super('Configuration', message);
  }
}

/**
 * Provides popout blocked error behavior.
 * @public
 */
export class PopoutBlockedError extends ExternalError {
  /** Prevents unsupported direct construction. @public */
  constructor(_nonConstructible: never, ..._args: never[]);
  /** @internal */
  constructor(message: string);
  /** @internal */
  constructor(message: string) {
    super('PopoutBlocked', message);
  }
}

/**
 * Provides api error behavior.
 * @public
 */
export class ApiError extends ExternalError {
  /** Prevents unsupported direct construction. @public */
  constructor(_nonConstructible: never, ..._args: never[]);
  /** @internal */
  constructor(message: string);
  /** @internal */
  constructor(message: string) {
    super('API', message);
  }
}

/**
 * Provides bind error behavior.
 * @public
 */
export class BindError extends ExternalError {
  /** Prevents unsupported direct construction. @public */
  constructor(_nonConstructible: never, ..._args: never[]);
  /** @internal */
  constructor(message: string);
  /** @internal */
  constructor(message: string) {
    super('Bind', message);
  }
}
