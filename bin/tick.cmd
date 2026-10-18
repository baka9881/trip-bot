@echo off
rem Run by the "Trip Bot" scheduled task every 15 minutes (hidden, through tick.vbs).
call "%~dp0deals.cmd" tick >> "%~dp0..\logs\tick.log" 2>&1
