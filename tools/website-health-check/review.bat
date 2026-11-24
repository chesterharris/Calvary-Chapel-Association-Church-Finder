@echo off
rem Double-click this AFTER running run.bat to review whatever the most
rem recent check found worth a human glance (403s, security-check pages,
rem Facebook links, etc.) - opens each one in its own browser window, one
rem at a time. Just close a window after you've looked it over and the
rem next one opens automatically. Ctrl+C in this window at any time stops
rem early without opening any more.
rem
rem Uses the same real-browser component run.bat installs on its first
rem run (Playwright + Chromium) - if you haven't run run.bat yet, run that
rem first so the one-time setup happens.

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found on this computer ^(or not on PATH^).
  echo Install it from https://nodejs.org/ ^(the LTS version^) and try again.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo The real-browser component isn't installed yet - run run.bat first
  echo ^(its first run installs this automatically^), then come back to this.
  pause
  exit /b 1
)

node review-flagged.mjs %*

echo.
pause
