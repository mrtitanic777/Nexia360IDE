@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
echo ========================================
echo  Nexia IDE - SDK Packer
echo ========================================
echo.
echo  This script copies your Xbox 360 SDK tools into the IDE
echo  so users don't need to install the SDK separately.
echo.

REM -- Auto-detect SDK location --
set "SDK_PATH="

REM Check XEDK environment variable
if defined XEDK (
    if exist "!XEDK!\bin" (
        set "SDK_PATH=!XEDK!"
        echo  Found SDK via XEDK env: !XEDK!
        goto :found
    )
)

REM Check simple paths first
if exist "C:\XEDK\bin" (
    set "SDK_PATH=C:\XEDK"
    echo  Found SDK at: C:\XEDK
    goto :found
)
if exist "D:\XEDK\bin" (
    set "SDK_PATH=D:\XEDK"
    echo  Found SDK at: D:\XEDK
    goto :found
)
if exist "D:\Microsoft Xbox 360 SDK\bin" (
    set "SDK_PATH=D:\Microsoft Xbox 360 SDK"
    echo  Found SDK at: D:\Microsoft Xbox 360 SDK
    goto :found
)

REM Check Program Files paths (parentheses-safe with delayed expansion)
set "_PF86=C:\Program Files (x86)\Microsoft Xbox 360 SDK"
if exist "!_PF86!\bin" (
    set "SDK_PATH=!_PF86!"
    echo  Found SDK at: !_PF86!
    goto :found
)
set "_PF=C:\Program Files\Microsoft Xbox 360 SDK"
if exist "!_PF!\bin" (
    set "SDK_PATH=!_PF!"
    echo  Found SDK at: !_PF!
    goto :found
)

echo  SDK not found automatically.
echo.
set /p SDK_PATH="  Enter your Xbox 360 SDK path: "
if not exist "!SDK_PATH!\bin" (
    echo  ERROR: !SDK_PATH!\bin does not exist.
    pause
    exit /b 1
)

:found
echo.
echo  Source: !SDK_PATH!
echo  Target: %~dp0sdk\
echo.
set /p CONFIRM="  Continue? [Y/N]: "
if /i not "!CONFIRM!"=="Y" exit /b 0

echo.
echo  [1/6] Creating sdk folder structure...
if exist "sdk" rmdir /s /q "sdk"
mkdir "sdk"
mkdir "sdk\bin"
mkdir "sdk\bin\win32"
mkdir "sdk\include"
mkdir "sdk\lib"

set "BIN32=!SDK_PATH!\bin\win32"
set "DEST_BIN=sdk\bin\win32"

echo  [2/6] Copying ALL runtime DLLs from bin\win32...
echo         (VC++ runtimes, compiler internals, PDB support, etc.)
set "DLL_COUNT=0"
for %%F in ("!BIN32!\*.dll") do (
    copy /y "%%F" "!DEST_BIN!\%%~nxF" >nul 2>nul && set /a DLL_COUNT+=1
)
echo     + !DLL_COUNT! DLLs copied

REM Copy locale subdirectories (1033 = English, 1041 = Japanese, etc.)
for /d %%D in ("!BIN32!\*") do (
    set "SUBDIR=%%~nxD"
    mkdir "!DEST_BIN!\!SUBDIR!" 2>nul
    set "SUB_COUNT=0"
    for %%F in ("%%D\*") do (
        copy /y "%%F" "!DEST_BIN!\!SUBDIR!\%%~nxF" >nul 2>nul && set /a SUB_COUNT+=1
    )
    if !SUB_COUNT! gtr 0 echo     + !SUBDIR!\ [!SUB_COUNT! files]
)

echo  [3/6] Copying ALL executables from bin\win32...
set "EXE_COUNT=0"
for %%F in ("!BIN32!\*.exe") do (
    copy /y "%%F" "!DEST_BIN!\%%~nxF" >nul 2>nul && set /a EXE_COUNT+=1
)
echo     + !EXE_COUNT! executables copied

echo  [4/6] Copying other bin files (manifests, configs, scripts, data)...
set "OTHER_COUNT=0"
for %%E in (manifest config cmd bat wsf js xml xsd dat bin cap) do (
    for %%F in ("!BIN32!\*.%%E") do (
        copy /y "%%F" "!DEST_BIN!\%%~nxF" >nul 2>nul && set /a OTHER_COUNT+=1
    )
)
echo     + !OTHER_COUNT! support files copied

echo  [5/6] Copying XEX files (PIX plugin, devkit helpers)...
set "XEX_COUNT=0"
for %%F in ("!BIN32!\*.xex") do (
    copy /y "%%F" "!DEST_BIN!\%%~nxF" >nul 2>nul && set /a XEX_COUNT+=1
)
echo     + !XEX_COUNT! XEX files copied

REM Also check bin\ root for tools not in win32
for %%F in (xbdm.dll xbdm.exe imagexex.exe fxc.exe) do (
    if not exist "!DEST_BIN!\%%F" (
        if exist "!SDK_PATH!\bin\%%F" (
            copy /y "!SDK_PATH!\bin\%%F" "!DEST_BIN!\%%F" >nul 2>nul && echo     + %%F [from bin\]
        )
    )
)

echo  [6/6] Copying include headers and libraries...
xcopy /s /e /y /q "!SDK_PATH!\include\*" "sdk\include\" >nul 2>nul
echo     + include\ [all headers]

if exist "!SDK_PATH!\lib\xbox" (
    mkdir "sdk\lib\xbox" 2>nul
    xcopy /s /e /y /q "!SDK_PATH!\lib\xbox\*" "sdk\lib\xbox\" >nul 2>nul
    echo     + lib\xbox\ [all libraries]
)
if exist "!SDK_PATH!\lib\win32" (
    mkdir "sdk\lib\win32" 2>nul
    xcopy /s /e /y /q "!SDK_PATH!\lib\win32\*" "sdk\lib\win32\" >nul 2>nul
    echo     + lib\win32\ [host libraries]
)

echo.

REM -- Verify critical tools and runtimes --
echo  Verifying critical files...
set "MISSING=0"

echo  -- Tools --
for %%F in (cl.exe link.exe imagexex.exe fxc.exe) do (
    if exist "!DEST_BIN!\%%F" (
        echo     OK: %%F
    ) else (
        echo     MISSING: %%F
        set "MISSING=1"
    )
)

echo  -- Compiler internals --
for %%F in (c1.dll c1xx.dll c2.dll) do (
    if exist "!DEST_BIN!\%%F" (
        echo     OK: %%F
    ) else (
        echo     MISSING: %%F
        set "MISSING=1"
    )
)

echo  -- VC++ runtimes --
for %%F in (msvcr100.dll msvcp100.dll msvcr90.dll msvcp90.dll msvcr80.dll msvcp80.dll) do (
    if exist "!DEST_BIN!\%%F" (
        echo     OK: %%F
    ) else (
        echo     MISSING: %%F
        set "MISSING=1"
    )
)

echo  -- PDB support --
for %%F in (mspdb80.dll mspdbcore.dll mspdbsrvx.exe) do (
    if exist "!DEST_BIN!\%%F" (
        echo     OK: %%F
    ) else (
        echo     MISSING: %%F
        set "MISSING=1"
    )
)

REM -- Count results --
set "TOOL_COUNT=0"
for %%F in ("!DEST_BIN!\*.exe") do set /a TOOL_COUNT+=1
set "DLL_TOTAL=0"
for %%F in ("!DEST_BIN!\*.dll") do set /a DLL_TOTAL+=1
set "HEADER_COUNT=0"
for /r "sdk\include" %%F in (*.h) do set /a HEADER_COUNT+=1

echo.
echo ========================================
echo  SDK Pack Complete!
echo ========================================
echo.
echo  Tools:    !TOOL_COUNT! executables
echo  DLLs:     !DLL_TOTAL! runtime/support libraries
echo  Headers:  !HEADER_COUNT! header files
echo  Location: %~dp0sdk\
echo.
if "!MISSING!"=="1" (
    echo  WARNING: Some critical files are missing.
    echo  The IDE may still work if users have the SDK installed separately.
) else (
    echo  All critical files present. The IDE is fully
    echo  self-contained and ready to distribute!
)
echo.
echo  Next steps:
echo    1. Run build.bat to build the portable .exe
echo    2. The sdk\ folder will be bundled automatically
echo.
pause
endlocal
