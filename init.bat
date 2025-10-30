@echo off
chcp 65001 > nul
cd /d "%~dp0"

echo ====================================
echo 初始化Git仓库并上传到GitHub
echo ====================================
echo.

echo [1/6] 初始化Git仓库...
git init

echo [2/6] 添加所有文件...
git add .

echo [3/6] 创建初始提交...
git commit -m "Initial commit: Auto Summary to Worldbook Extension v1.0.0"

echo [4/6] 重命名分支为main...
git branch -M main

echo [5/6] 添加远程仓库...
git remote add origin https://github.com/cnfh1746/auto-summary-to-worldbook.git

echo [6/6] 推送到GitHub...
git push -u origin main

echo.
echo ====================================
echo 初始化完成！
echo 后续使用 push.bat 进行更新
echo ====================================
pause
