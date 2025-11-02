@echo off
chcp 65001 >nul
echo ====================================
echo   自动总结世界书 - 一键上传到GitHub
echo ====================================
echo.

REM 检查是否有未提交的更改
git status --short
if %errorlevel% neq 0 (
    echo [错误] Git 未正确初始化
    pause
    exit /b 1
)

echo.
echo [1/4] 添加所有更改到暂存区...
git add .
if %errorlevel% neq 0 (
    echo [错误] 添加文件失败
    pause
    exit /b 1
)

echo [2/4] 提交更改...
set /p commit_msg="请输入提交信息 (直接回车使用默认信息): "
if "%commit_msg%"=="" (
    set commit_msg=Update: 更新扩展代码
)
git commit -m "%commit_msg%"
if %errorlevel% neq 0 (
    echo [提示] 没有需要提交的更改，或提交失败
)

echo [3/4] 拉取远程更改...
git pull origin main --rebase
if %errorlevel% neq 0 (
    echo [警告] 拉取远程更改时出现问题，继续推送...
)

echo [4/4] 推送到 GitHub...
git push -u origin main
if %errorlevel% neq 0 (
    echo [错误] 推送失败，请检查网络连接和权限
    pause
    exit /b 1
)

echo.
echo ====================================
echo   ✓ 成功上传到 GitHub!
echo   仓库地址: https://github.com/cnfh1746/auto-summary-to-worldbook
echo ====================================
echo.
pause
