@echo off
rem Double-click this to run the church website link health check.
rem It prints progress in this window, writes a dated report into the
rem "reports" folder next to this script, and opens it automatically
rem when done. Takes roughly 5-10 minutes for ~1,460 churches (longer
rem the first time - see below - and a bit longer still with the
rem real-browser recheck step, which only re-checks a few dozen links).

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found on this computer ^(or not on PATH^).
  echo Install it from https://nodejs.org/ ^(the LTS version^) and try again.
  pause
  exit /b 1
)

rem First run only: install the real-browser recheck dependency
rem (Playwright) and its own copy of Chromium. This is a one-time,
rem roughly 300MB download and can take a few minutes. If it fails or
rem is skipped, the link check still runs fine - it just skips the
rem real-browser recheck step for any 403s/connection resets it finds.
if not exist "node_modules" (
  echo First-time setup: installing the real-browser recheck component...
  echo ^(this is a one-time, ~300MB download - safe to let it finish^)
  call npm install
  call npx playwright install chromium
  echo.
)

node check-links.mjs %*

echo.
pause
