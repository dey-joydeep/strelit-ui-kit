## Strelit UI Community Policy

The Strelit UI project adopts the following community policy to assist maintainers with keeping the product reliable and well-maintained:

- Reliability is the highest priority.
- Browser support follows the `browserslist` in [`package.json`](./package.json): the latest Chrome and Firefox releases, the latest two major Edge, Safari, and iOS releases, and Firefox ESR.
- Releases and incorporation of PRs will be done in a planned fashion to ensure reliability can be maintained and application developers can upgrade their applications to new releases in a controlled fashion.
- Major releases can have breaking changes. While these will be documented, it will probably be as dot points. Examination of source code may be necessary for application developers.
- Developers should discuss PRs with maintainers before submitting. This will reduce the review effort because PRs will be developed in line with maintainer expectations.
- PRs must use the same coding style. Consistency is important for readability and maintainability.
- PRs are expected to use the repository PR template and pass contribution-governance checks for PR metadata and commit message quality.
- PRs with new feature releases **must** include updates to the apitest app **and** the documentation. In addition, the code base needs to be satisfactorily refactored so that the code implementing the feature is properly integrated.
- Submitters of PRs are expected to thoroughly test their changes before submitting.
- All maintainers need to be actively involved in community.
- Features, fixes, and PRs will not be actioned if no maintainer is interested in addressing them.
- Maintainers can enter into paid agreements with users to implement features, fixes or review pull requests.
  - Such agreements **must** be declared publicly and **cannot** override community processes or be binding on the community.
