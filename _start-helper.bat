@echo off 
cd /d "C:\Users\mirza.syazwan\Documents\OSMAGIC_Experiment 1 v5_Edit functions\" 
echo ======================================== 
echo   JOSM Helper Starting... 
echo ======================================== 
echo. 
"C:\Users\mirza.syazwan\AppData\Local\Programs\Python\Python311\python.exe" josm-helper.py 
if errorlevel 1 pause 
