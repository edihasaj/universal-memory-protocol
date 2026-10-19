---
summary: Publish and verify a patch release of the UMP reference SDK.
read_when:
  - Releasing the UMP npm package or creating its GitHub release.
---

# Releasing UMP

The package version in `package.json` is the release version. The portable
record protocol remains UMP 1.0 unless a separately reviewed specification
change requires a new protocol version.

1. Update `package.json` and add a dated section to `CHANGELOG.md`. A package
   version change alone does not change the pnpm root importer lock entry.
2. Run `pnpm typecheck`, `pnpm test`, `pnpm build` and `git diff --check`.
3. Inspect `npm pack --dry-run --json`. Pack the archive into a temporary
   directory and smoke-test the packed SDK, not only the source checkout.
4. Commit the explicit release paths and push `main`. Wait for the repository
   CI workflow to pass on that exact commit.
5. Publish the inspected archive with `npm publish ARCHIVE --access public`,
   using the existing npm authentication. If an OTP or token is needed, follow
   the shared 1Password release workflow and never print credentials.
6. Create `vX.Y.Z` at the tested commit. Create a GitHub release titled
   `Universal Memory Protocol X.Y.Z`, with the curated changelog bullets as its
   body. Attach the npm archive and its SHA-256 checksum.
7. Verify the registry version, integrity, GitHub tag, release notes and assets.
   Install the published version into a disposable directory and repeat the
   packed SDK smoke test.

The repository currently has a CI workflow rather than an automated npm
publishing workflow. Do not assume that pushing a tag publishes the package.
Release authentication must use the existing scoped credentials; do not add
tokens to this repository.

If registry authentication fails, the tested archive and checksum can still be
published as GitHub release assets. Report the registry failure explicitly and
verify downstream installations against that exact archive. A dependency may
temporarily pin its immutable release-asset URL and lockfile integrity; it must
not pretend that the unavailable registry version has been published.
