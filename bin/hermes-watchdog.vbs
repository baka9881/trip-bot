' Runs hermes-watchdog.ps1 without a console window.
CreateObject("WScript.Shell").Run "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""C:\Users\shiro\AppData\Local\hermes\profiles\trip\projects\trip-bot\bin\hermes-watchdog.ps1""", 0, True
