/** Reports cleanup failure without replacing the operation's primary error. */
export function reportSecondaryCleanupError(
  context: string,
  error: unknown,
): void {
  try {
    if (typeof globalThis.reportError === 'function') {
      globalThis.reportError(error);
    } else {
      console.error(`Cleanup failed after ${context} failed`, error);
    }
  } catch {
    // Diagnostics must not replace the primary failure.
  }
}
