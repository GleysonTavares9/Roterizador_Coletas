# Motorista App (Android)

Este projeto é um aplicativo Android nativo em Kotlin desenvolvido para:
1. Exibir a interface do motorista (Frontend React) via WebView.
2. Capturar a localização GPS em tempo real (Background Service).
3. Enviar a telemetria para o servidor Python.

## Estrutura do Projeto
- **MainActivity.kt**: Gerencia a WebView e permissões.
- **LocationService.kt**: Serviço em segundo plano que envia latitude/longitude para a API.
- **AndroidManifest.xml**: Configurações e permissões.

## Como Compilar
1. Abra este diretório no **Android Studio**.
2. O Gradle deve sincronizar automaticamente.
3. Altere a `FRONTEND_URL` e `BACKEND_API_URL` no `MainActivity.kt` e `LocationService.kt` para os seus endereços reais (ex: Vercel e IP do servidor).
4. Conecte um dispositivo ou emulador e clique em **Run**.

## Backend
Certifique-se de que o backend Python tenha o endpoint `/api/telemetry` aceitando POST com JSON:
```json
{
  "driver_id": "uuid",
  "latitude": -23.55,
  "longitude": -46.63,
  "timestamp": "ISO-8601"
}
```
