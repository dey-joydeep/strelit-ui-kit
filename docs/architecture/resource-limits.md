# Recursive Input Limits

Strelit accepts recursive layout configuration and serializable component state from applications. Both structures are treated as untrusted input at their public boundaries.

The runtime independently limits item trees and nested open-popout graphs to
128 levels, and limits a layout plus all of its popouts to 10,000 total resolved
nodes. These bounds are intentionally far above practical UI depth while
preventing stack exhaustion and unbounded traversal. They apply during config
resolution, minification, and again before runtime item construction so
resolved objects cannot bypass the public resolver.

Configurations with more than 128 nested popouts are rejected with
`ConfigurationError`. This safety constraint also applies to previously saved
configuration; applications with unusually deep generated popout graphs must
flatten them before loading or migrating them.

Component state cloning is iterative rather than recursively calling the JavaScript stack. It uses the same depth and node limits, rejects cycles, and accepts only the documented `SerializableValue` domain. Limits are implementation safety constraints, not values applications should design toward.

The shared constants live in `src/ts/utils/resource-limits.ts`. Any change requires adversarial boundary tests in `test/specs/resource-limit-tests.ts`, updated public error documentation, and a security review of every traversal using the constants.
