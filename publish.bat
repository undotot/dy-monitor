@echo off
chcp 65001 >nul
title 监控室 · 一键提交与发布助手

set SCRIPT_DIR=%~dp0
if exist "%SCRIPT_DIR%douyu-monitor" (
    cd /d "%SCRIPT_DIR%douyu-monitor"
) else if exist "%SCRIPT_DIR%scripts\publish.mjs" (
    cd /d "%SCRIPT_DIR%"
) else (
    echo [错误] 找不到 douyu-monitor 源码工程目录！
    pause
    exit /b 1
)

echo.
echo ======================================================
echo 🛠️  监控室 · 一键提交与发布助手
echo ======================================================
echo.

node scripts/publish.mjs %*
set EXIT_CODE=%ERRORLEVEL%

if %EXIT_CODE% NEQ 0 (
    echo.
    echo ❌ 发布流程失败或被中断 (退出代码: %EXIT_CODE%)
) else (
    echo.
    echo ✓ 发布流程执行完毕！
)

echo.
echo 按任意键退出本窗口...
pause >nul
exit /b %EXIT_CODE%
