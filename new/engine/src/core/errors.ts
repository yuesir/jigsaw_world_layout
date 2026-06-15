/**
 * Engine-level error classes.
 */

export class EngineError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'EngineError';
  }
}

export class ShaderError extends EngineError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'ShaderError';
  }
}

export class ShaderLinkError extends EngineError {
  constructor(message: string, public readonly programName: string, cause?: unknown) {
    super(message, cause);
    this.name = 'ShaderLinkError';
  }
}

export class ContextError extends EngineError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'ContextError';
  }
}

export class TextureError extends EngineError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'TextureError';
  }
}
