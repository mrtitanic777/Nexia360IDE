# Changelog

## v1.1.0

### Build System
- **Incremental compilation** — only recompiles source files that changed since the last build. Object file timestamps are compared against source (and PCH) timestamps; unchanged files are skipped. Build output shows "N files up-to-date, skipped."
- **Parallel compilation** — up to 4 source files compile concurrently, roughly halving full rebuild times on multi-core machines. PCH still compiles first sequentially since all files depend on it.
- **Response file for linker** — linker arguments are written to `link.rsp` instead of being passed on the command line, fixing "The command line is too long" errors on large projects (120+ source files).
- **Case-insensitive source dedup** — source file discovery now uses case-insensitive path comparison, preventing duplicate object file warnings when `sourceFiles` in nexia.json has different casing than files on disk.
- **Object name collision detection** — warns at build time if two source files in different directories would produce the same `.obj` name.
- **Stale source file cleanup** — on project open, `sourceFiles` entries that no longer exist on disk are automatically pruned from nexia.json.

### Project Properties
- **New Project Properties dialog** (Build → Project Properties...) with persistent per-project compiler and linker settings:
  - **Enable RTTI** (`/GR` vs `/GR-`) — fixes C4541 warnings when using `dynamic_cast` on polymorphic types
  - **Exception Handling** — `/EHsc`, `/EHs`, `/EHa`, or disabled
  - **Warning Level** — `/W0` through `/W4`
  - **Additional Compiler Flags** — free-form text for extra cl.exe flags
  - **Additional Linker Flags** — free-form text for extra link.exe flags
- All settings saved to nexia.json and applied automatically on build.

### Editor
- **Find & Replace in Files** — the Search panel now supports replace. Toggle the ↔ option to reveal the replace input and "Replace All" button. Confirms before replacing, updates open editor tabs, and refreshes search results.

### Workspace
- **Workspace state persistence** — open tabs, expanded folders, sidebar/panel visibility, and active tab are saved on close and restored on reopen.
- **File type filtering on import** — "Add Existing File" filters by context (headers vs sources) and copies to the appropriate directory.
- **Multi-file selection** — import multiple files at once.
- **Hide project config files** — nexia.json and nexia-workspace.json hidden from the file explorer by default.

### Bug Fixes
- Fixed UTF-8 encoding corruption across all source files (3,700+ mojibake sequences from cp1252 double-encoding).
- Fixed build output double-spacing caused by trailing newline handling in `appendOutput()`.
- Fixed copyright symbol mojibake in package.json.
- Removed auto-generated assets folder from new projects.
- Fixed `getSystemInfo` sending the XBDM command repeatedly due to missing `sentCommand` guard, causing duplicate commands and wasted bandwidth.
- Fixed `listVolumes` using a blind `setTimeout` instead of detecting the XBDM end-of-response marker (`\r\n.\r\n`), improving reliability on slow connections and removing unnecessary delay on fast ones.
- Fixed hardcoded `project:export` and `project:import` IPC strings — added `PROJECT_EXPORT` and `PROJECT_IMPORT` to the `IPC` constants object and updated all references.
- Fixed `elapsed()` centisecond calculation displaying incorrect values (e.g. 5ms showing as 50cs).
- Moved `guildId` declaration to the top of the Discord class with other private fields for clarity.

### Security Fixes
- Fixed command injection vulnerability in project export/import — replaced `execSync` with `execFile` + argument arrays and added path escaping.
- Fixed command injection vulnerability in extension zip extraction — added single-quote escaping for PowerShell paths.
- Added URL validation for Discord download handler, restricting downloads to `cdn.discordapp.com` and `media.discordapp.net`.
- Replaced `mainWindow!` non-null assertions with proper null checks to prevent crashes during shutdown or before window creation.

### Reliability Fixes
- Added `console.error()` logging to previously silent `catch {}` blocks in settings loading, recent projects, extension state, and installed extensions.

## v1.0.0

Initial release.
