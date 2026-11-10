@echo off
rem ============================================================
rem  WorkForceNexus - start everything:
rem    backend, chat server, frontend, ngrok
rem  (The AI service in FYP_AI is NOT started: the backend has a built-in planner and
rem   only uses FYP_AI when Ai:PlannerUrl is set in appsettings.json.)
rem  (WebRTC calls need no server of their own.)
rem  Double-click this file. Each service opens in its own window;
rem  close a window to stop that service.
rem  Needs: .NET SDK, Node.js, SQL Server LocalDB, ngrok.
rem ============================================================
setlocal
set "ROOT=%~dp0"

echo [1/4] Starting backend (ASP.NET, https://localhost:7259 and http://localhost:5089) ...
start "WFN Backend" cmd /k "cd /d "%ROOT%FYP_BACKEND\fyp_project" && dotnet run --launch-profile https"

rem Give the backend a head start: the chat server talks to it.
timeout /t 12 /nobreak >nul

echo [2/4] Starting chat server (Node, port 4000) ...
if not exist "%ROOT%FYP_CHAT\node_modules" (
  start "WFN Chat" cmd /k "cd /d "%ROOT%FYP_CHAT" && npm install && npm start"
) else (
  start "WFN Chat" cmd /k "cd /d "%ROOT%FYP_CHAT" && npm start"
)

echo [3/4] Starting frontend (Vite, http://localhost:5173) ...
if not exist "%ROOT%FYP_FRONTEND\node_modules" (
  start "WFN Frontend" cmd /k "cd /d "%ROOT%FYP_FRONTEND" && npm install && npm run dev"
) else (
  start "WFN Frontend" cmd /k "cd /d "%ROOT%FYP_FRONTEND" && npm run dev"
)

echo [4/4] Starting ngrok (public address for the Safepay webhook, forwards to port 5089) ...
where ngrok >nul 2>&1
if errorlevel 1 (
  echo       ngrok was not found in PATH, so it is skipped.
) else (
  start "WFN ngrok" cmd /k "ngrok http 5089"
)

timeout /t 6 /nobreak >nul
start "" http://localhost:5173

echo.
echo Everything was started in separate windows.
echo Calls (WebRTC): open two browsers with two different logins and allow camera/microphone.
echo If ngrok shows a NEW address, update the webhook URL in the Safepay dashboard.
endlocal
