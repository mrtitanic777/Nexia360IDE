@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo.
echo  +======================================+
echo  :       Nexia IDE - Build System       :
echo  +======================================+
echo.

REM -- Timestamp --
for /f "tokens=1-4 delims=:. " %%a in ("%TIME%") do set "START_H=%%a" & set "START_M=%%b" & set "START_S=%%c"
set "BUILD_START=%TIME%"
echo  Started: %DATE% %TIME%
echo  ----------------------------------------
echo.

REM ======================================
REM  STEP 1: Pre-flight checks
REM ======================================
echo  [1/7] Pre-flight checks...

REM Check Node.js
where node >nul 2>nul
if errorlevel 1 (
    echo    [X] Node.js not found! Install from https://nodejs.org
    goto :error
)
for /f "tokens=*" %%v in ('node -v') do echo    [OK] Node.js %%v

REM Check npm
where npm >nul 2>nul
if errorlevel 1 (
    echo    [X] npm not found!
    goto :error
)
for /f "tokens=*" %%v in ('npm -v') do echo    [OK] npm %%v

REM Check TypeScript
if exist "node_modules\.bin\tsc.cmd" (
    for /f "tokens=*" %%v in ('node_modules\.bin\tsc --version') do echo    [OK] %%v
) else (
    echo    [!!] TypeScript not installed yet (will install in next step)
)

REM Check electron-builder
if exist "node_modules\.bin\electron-builder.cmd" (
    echo    [OK] electron-builder found
) else (
    echo    [!!] electron-builder not installed yet (will install in next step)
)

echo    [OK] Pre-flight checks passed
echo.

REM ======================================
REM  STEP 2: Check bundled SDK
REM ======================================
echo  [2/7] Checking bundled SDK...

if exist "sdk\bin\win32\cl.exe" (
    echo    [OK] SDK found

    REM Count SDK files
    set "SDK_EXES=0"
    set "SDK_DLLS=0"
    for %%f in (sdk\bin\win32\*.exe) do set /a SDK_EXES+=1
    for %%f in (sdk\bin\win32\*.dll) do set /a SDK_DLLS+=1
    echo    [OK] !SDK_EXES! executables, !SDK_DLLS! DLLs in bin\win32

    REM Check critical tools
    set "MISSING="
    for %%f in (cl.exe link.exe lib.exe imagexex.exe fxc.exe) do (
        if not exist "sdk\bin\win32\%%f" set "MISSING=!MISSING! %%f"
    )
    if defined MISSING (
        echo    [!!] Missing critical tools:!MISSING!
    ) else (
        echo    [OK] All critical build tools present
    )

    REM Check runtime DLLs
    if exist "sdk\bin\win32\msvcr100.dll" (
        echo    [OK] VC++ runtime DLLs present
    ) else (
        echo    [!!] msvcr100.dll missing -- SDK tools may fail at runtime
    )

    REM Check headers/libs
    set "HDR_COUNT=0"
    if exist "sdk\include" (
        for /r "sdk\include" %%f in (*.h) do set /a HDR_COUNT+=1
        echo    [OK] !HDR_COUNT! header files
    ) else (
        echo    [!!] No include directory found
    )

    REM SDK total file count
    set "SDK_SIZE=0"
    for /r "sdk" %%f in (*) do set /a SDK_SIZE+=1
    echo    [OK] !SDK_SIZE! total SDK files will be bundled
) else (
    echo    [!!] No bundled SDK found
    echo         Run pack-sdk.bat first to bundle SDK tools,
    echo         or users will need the SDK installed separately.
)
echo.

REM ======================================
REM  STEP 3: Install dependencies
REM ======================================
echo  [3/7] Installing dependencies...
call npm install --no-audit --no-fund 2>nul
if errorlevel 1 (
    echo    [X] npm install failed!
    goto :error
)

REM Count packages
set "PKG_COUNT=0"
for /d %%d in (node_modules\*) do set /a PKG_COUNT+=1
echo    [OK] !PKG_COUNT! packages installed
echo.

REM ======================================
REM  STEP 4: TypeScript compilation
REM ======================================
echo  [4/7] Compiling TypeScript...
call node_modules\.bin\tsc 2> ts_errors.tmp
if errorlevel 1 (
    echo    [X] TypeScript compilation failed!
    echo.
    echo  -- Errors ------------------------------------
    type ts_errors.tmp
    echo  ----------------------------------------------
    del ts_errors.tmp 2>nul
    goto :error
)
del ts_errors.tmp 2>nul

REM Count compiled files
set "TS_COUNT=0"
set "JS_COUNT=0"
for /r "src" %%f in (*.ts) do set /a TS_COUNT+=1
for /r "dist" %%f in (*.js) do set /a JS_COUNT+=1
echo    [OK] Compiled !TS_COUNT! TypeScript files -- !JS_COUNT! JavaScript output files
echo.

REM ======================================
REM  STEP 5: Copy assets
REM ======================================
echo  [5/7] Copying assets...
call node scripts/copy-assets.js
if errorlevel 1 (
    echo    [X] Asset copy failed!
    goto :error
)

REM Check what was copied
set "ASSET_COUNT=0"
if exist "dist\renderer" (
    for /r "dist\renderer" %%f in (*) do set /a ASSET_COUNT+=1
)
echo    [OK] !ASSET_COUNT! asset files copied to dist/
echo.

REM ======================================
REM  STEP 6: Package portable .exe
REM ======================================
echo  [6/7] Packaging portable .exe...
echo.

node --no-deprecation scripts/build-portable.js
if errorlevel 1 (
    echo.
    echo    [X] Packaging failed!
    goto :error
)
echo.

REM Find the built app
if exist "dist\win-unpacked\Nexia IDE.exe" (
    REM Count files and get size
    set "UNPACKED_FILES=0"
    for /r "dist\win-unpacked" %%f in (*) do set /a UNPACKED_FILES+=1
    echo    [OK] Built: dist\win-unpacked\ - !UNPACKED_FILES! files
) else (
    echo    [X] No build output found in dist\win-unpacked\
    goto :error
)
echo.

REM ======================================
REM  STEP 7: Deploy to Desktop
REM ======================================
echo  [7/7] Deploying to Desktop...
set "DESKTOP=%USERPROFILE%\Desktop"
set "DEPLOY_DIR=%DESKTOP%\Nexia IDE"

REM Copy the entire build folder to Desktop
echo    Copying to "%DEPLOY_DIR%"...
if exist "%DEPLOY_DIR%" (
    echo    [i] Removing previous install...
    rmdir /s /q "%DEPLOY_DIR%" 2>nul
)
xcopy "dist\win-unpacked" "%DEPLOY_DIR%\" /e /i /q /y >nul
if errorlevel 1 (
    echo    [!!] Could not copy to Desktop
    echo         Run directly from: dist\win-unpacked\Nexia IDE.exe
) else (
    echo    [OK] Deployed to Desktop\Nexia IDE\
    echo    [OK] Run: "%DEPLOY_DIR%\Nexia IDE.exe"
)

REM Create Desktop shortcut
echo    Creating desktop shortcut...
echo Set oWS = WScript.CreateObject("WScript.Shell") > "%TEMP%\nexia-shortcut.vbs"
echo Set oLink = oWS.CreateShortcut("%DESKTOP%\Nexia IDE.lnk") >> "%TEMP%\nexia-shortcut.vbs"
echo oLink.TargetPath = "%DEPLOY_DIR%\Nexia IDE.exe" >> "%TEMP%\nexia-shortcut.vbs"
echo oLink.WorkingDirectory = "%DEPLOY_DIR%" >> "%TEMP%\nexia-shortcut.vbs"
echo oLink.Description = "Xbox 360 Development Environment" >> "%TEMP%\nexia-shortcut.vbs"
if exist "%DEPLOY_DIR%\resources\icon.ico" (
    echo oLink.IconLocation = "%DEPLOY_DIR%\resources\icon.ico" >> "%TEMP%\nexia-shortcut.vbs"
)
echo oLink.Save >> "%TEMP%\nexia-shortcut.vbs"
cscript //nologo "%TEMP%\nexia-shortcut.vbs" >nul 2>nul
del "%TEMP%\nexia-shortcut.vbs" 2>nul
if exist "%DESKTOP%\Nexia IDE.lnk" (
    echo    [OK] Shortcut created: "Nexia IDE" on Desktop
) else (
    echo    [!!] Could not create shortcut
)
echo.

REM ======================================
REM  BUILD SUMMARY
REM ======================================
for /f "tokens=1-4 delims=:. " %%a in ("%TIME%") do set "END_H=%%a" & set "END_M=%%b" & set "END_S=%%c"
set /a "ELAPSED_S=(END_H*3600 + END_M*60 + END_S) - (START_H*3600 + START_M*60 + START_S)"
if !ELAPSED_S! lss 0 set /a ELAPSED_S+=86400
set /a "ELAPSED_M=ELAPSED_S / 60"
set /a "ELAPSED_R=ELAPSED_S %% 60"

echo  +======================================+
echo  :        BUILD SUCCESSFUL              :
echo  +======================================+
echo  :                                      :
echo  :  Output: Desktop\Nexia IDE\          :
echo  :  Files:  !UNPACKED_FILES! files
echo  :  Time:   !ELAPSED_M!m !ELAPSED_R!s
echo  :                                      :
echo  :  Open "Desktop\Nexia IDE" and run    :
echo  :  "Nexia IDE.exe" to launch!          :
echo  :                                      :
echo  +======================================+
echo.
pause
exit /b 0

:error
echo.
echo  +======================================+
echo  :          BUILD FAILED                :
echo  +======================================+
echo.
echo  Check the errors above and try again.
echo  Common fixes:
echo    - Run pack-sdk.bat to bundle SDK
echo    - Delete node_modules and re-run
echo    - Check TypeScript errors in src/
echo.
pause
exit /b 1