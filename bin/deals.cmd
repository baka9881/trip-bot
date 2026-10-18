@echo off
rem trip-bot command line (src/cli.ts) on the system Node, for Windows callers such as the scheduled task.
setlocal
set "BOT=C:\Users\shiro\AppData\Local\hermes\profiles\trip\projects\trip-bot"
set "NODE=C:\Program Files\nodejs\node.exe"
rem tsx runs the code in a child node, which inherits the warning switch only through NODE_OPTIONS.
set "NODE_OPTIONS=--disable-warning=ExperimentalWarning"
cd /d "%BOT%" || exit /b 1
"%NODE%" "%BOT%\node_modules\tsx\dist\cli.mjs" "%BOT%\src\cli.ts" %*
