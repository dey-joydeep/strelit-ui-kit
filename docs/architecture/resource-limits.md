# Recursive Input Limits

Strelit accepts recursive layout configuration and serializable component state from applications. Both structures are treated as untrusted input at their public boundaries.

The runtime limits configuration to 128 nested items and 10,000 total items. These bounds are intentionally far above practical UI depth while preventing stack exhaustion and unbounded traversal. They apply during config resolution and again before runtime item construction so resolved objects cannot bypass the public resolver.

Component state cloning is iterative rather than recursively calling the JavaScript stack. It uses the same depth and node limits, rejects cycles, and accepts only the documented `SerializableValue` domain. Limits are implementation safety constraints, not values applications should design toward.

The shared constants live in `src/ts/utils/resource-limits.ts`. Any change requires adversarial boundary tests in `test/specs/resource-limit-tests.ts`, updated public error documentation, and a security review of every traversal using the constants.
