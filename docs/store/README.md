# Publicar la app ARTA (App Store y Google Play)

App nativa `com.artaproducciones.ops` (Android Kotlin/Compose, iOS SwiftUI) en `apps/mobile-native/`.
La **desarrolla y publica NEXARA** (NEW ENGINEERING EXPERTISE AND RESOURCE ADVANCEMENT S.A. DE C.V.) con sus
cuentas de desarrollador; la usa el equipo de **Arta Producciones**. Todo copiado de cómo quedó NEXARA tras su
rechazo de App Store del 25-09-2026 (3.2, 2.3.10 y 2.1).

| Documento | Para qué |
| --- | --- |
| [`IOS-APP-STORE.md`](IOS-APP-STORE.md) | App Store Connect: alta de la app, textos, privacidad, notas para revisión, TestFlight |
| [`PLAY-STORE.md`](PLAY-STORE.md) | Play Console: alta, ficha, «Contenido de la app», seguridad de los datos, subir el AAB |
| [`CUENTA-REVISION.md`](CUENTA-REVISION.md) | Cuenta de revisión en una organización demo aislada (Apple 2.1 / Play «Acceso a la app») |

## URLs públicas (ya en producción)

- Aviso de privacidad: https://artaproducciones.com/legal/privacidad
- Términos de uso: https://artaproducciones.com/legal/terminos
- Eliminar cuenta: https://artaproducciones.com/legal/eliminar-cuenta
- Soporte: https://artaproducciones.com/legal/soporte

Las cuatro también se abren desde la app (inicio de sesión y pestaña «Más»).

## Decisión pendiente de Adam: cómo se distribuye

ARTA es una app de **una sola organización** (cuentas solo por invitación). Apple rechaza las apps «solo para el
personal de una empresa» publicadas en la tienda abierta (3.2) y puede pedir que el vendedor sea dueño de la marca
(5.2.1: la app se llama ARTA pero la vende NEXARA). NEXARA pasó 3.2 porque es multiempresa; ARTA no puede usar ese
argumento. Opciones:

| Opción | iOS | Android | Recomendación |
| --- | --- | --- | --- |
| **A. Sin listar** | *Unlisted App Distribution*: pasa revisión, no aparece en búsquedas, se instala con un enlace. Se pide con el formulario de Apple después de crear la app. | **Prueba interna** (hasta 100 correos) o **prueba cerrada** con la lista del equipo; no aparece en Play. | **Sí.** Es el caso de uso exacto y no pelea con 3.2. |
| B. App personalizada | *Custom App* vía Apple Business Manager de Arta Producciones (necesita su cuenta ABM y D-U-N-S). | *Managed Google Play* privado de Arta. | Si Arta ya tiene ABM / Google Workspace. |
| C. Tienda abierta | Riesgo alto de rechazo 3.2 / 5.2.1. | Posible, pero innecesario. | No. |

Para 5.2.1, en cualquier opción: **carta de Arta Producciones** autorizando a NEXARA a publicar la app con su
nombre y logo (PDF), que se adjunta en App Store Connect → Información de revisión.

## Orden

1. ✅ API y web en producción con anticipos y chat v2 (04-10-2026, `a59b5e4`+).
2. Adam: cuenta de servicio de Firebase nueva (`deploy/firebase-cuenta-servicio.ps1`) y clave APNs `.p8` en Firebase.
3. Adam: cuenta de revisión (`apps/api/scripts/resembrar-cuenta-revision.ps1`, ver `CUENTA-REVISION.md`).
4. **Android**: Play Console → crear app → subir `Documents\ARTA-builds\arta-1.0.0-1.aab` a **prueba interna**
   (ver `PLAY-STORE.md`). La primera subida es manual.
5. **iOS**: crear la app en App Store Connect → `pwsh -File scripts\subir-secretos-ios.ps1` → lanzar
   «iOS · TestFlight» desde GitHub Actions → probar en TestFlight con el equipo.
6. Capturas de pantalla (pendiente de hacer, ver cada documento) y, si se elige la opción A en iOS, pedir
   distribución sin listar y mandar a revisión.
