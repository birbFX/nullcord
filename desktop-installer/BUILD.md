# NullCord Desktop installer

This directory builds the Windows installer and portable executable with
automatic updates.

```bash
npm install
npm run dist
```

Artifacts are written to `release/`:

- `NullCord-Setup-<version>.exe` — NSIS installer
- `NullCord-<version>-portable.exe` — portable build
- `latest.yml` and `.blockmap` files — updater metadata

The updater is `electron-updater` using the GitHub provider configured in
`package.json`. Publish a GitHub release containing the installer, portable
EXE, `latest.yml`, and the installer blockmap. Existing installs download the
new version in the background and install it on exit or when the user chooses
"Restart and install".

Unsigned builds trigger Windows SmartScreen; signing requires a code-signing
certificate.
