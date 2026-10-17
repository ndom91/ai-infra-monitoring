// Transient: worth retrying later (network, timeouts, 429, 5xx).
// Permanent: retrying won't help (4xx, schema drift, bad config).
export type ErrorClass = "transient" | "permanent";

export class CollectorError extends Error {
	readonly errorClass: ErrorClass;
	constructor(errorClass: ErrorClass, message: string, options?: ErrorOptions) {
		super(message, options);
		this.name =
			errorClass === "transient" ? "TransientError" : "PermanentError";
		this.errorClass = errorClass;
	}
}

export const transient = (msg: string, cause?: unknown) =>
	new CollectorError("transient", msg, { cause });
export const permanent = (msg: string, cause?: unknown) =>
	new CollectorError("permanent", msg, { cause });

export function classify(err: unknown): CollectorError {
	if (err instanceof CollectorError) return err;
	const msg = err instanceof Error ? err.message : String(err);
	// Unknown errors are treated as permanent so they get looked at.
	return permanent(msg, err);
}
