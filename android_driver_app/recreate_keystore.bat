@echo off
echo ========================================
echo RECRIANDO KEYSTORE COM ALIAS CORRETO
echo ========================================
echo.

set KEYSTORE=release-key.jks
set ALIAS=upload
set STOREPASS=Roterizacao@2025
set KEYPASS=Roterizacao@2025
set DNAME="CN=Roterizacao Driver, OU=Mobile, O=Roterizacao, L=Belo Horizonte, ST=MG, C=BR"
set VALIDITY=10000

echo Removendo keystore antiga...
if exist %KEYSTORE% del %KEYSTORE%

set KEYTOOL=C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe

echo.
echo Criando nova keystore com alias 'upload'...
echo.

"%KEYTOOL%" -genkeypair -v -keystore %KEYSTORE% -alias %ALIAS% -keyalg RSA -keysize 2048 -validity %VALIDITY% -storepass %STOREPASS% -keypass %KEYPASS% -dname %DNAME% -storetype JKS

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo KEYSTORE RECRIADA COM SUCESSO!
    echo ========================================
    echo Arquivo: %KEYSTORE%
    echo Alias: %ALIAS%
    echo Senha: %STOREPASS%
    echo ========================================
    echo.
    echo Agora execute o build novamente!
    echo.
) else (
    echo.
    echo ERRO ao criar keystore!
)

pause
