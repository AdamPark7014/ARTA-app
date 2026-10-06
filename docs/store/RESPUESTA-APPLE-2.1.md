# Respuesta a App Review — Guideline 2.1 (Information Needed), 06-10-2026

Apple rechazó la 1.0.0 (build 4) pidiendo información porque la cuenta tiene poco historial de revisión. Pide
un video en un iPhone físico y seis respuestas, y que también queden en las notas de revisión. Además, el
video debe mostrar **reportar y bloquear** en el chat (guía 1.2): se agregaron en la 1.0.0 build 5 (ver
`docs/chat-reportar-bloquear.md`).

## Guion del video (lo graba Adam en su iPhone con la build de TestFlight)

iPhone con el iOS más reciente → Ajustes › Centro de control › Grabación de pantalla. Duración: 2–3 min.

1. Desde la pantalla de inicio del iPhone, abrir **ARTA** (el video debe empezar al abrir la app).
2. Iniciar sesión con `revision.tiendas@artaproducciones.com` y su contraseña.
3. **Inicio**: mostrar el resumen; tocar «Aprobaciones».
4. **Aprobaciones**: aprobar la orden de compra de Sonido Quetzal Pro (o el anticipo).
5. **Tareas**: abrir «Confirmar el rider técnico…» y mostrar el detalle.
6. **Chats**: abrir el canal «Trío Luna de Plata · Noche de Boleros», enviar un mensaje.
7. Mantener presionado un mensaje de Mateo › **Reportar** › «Contenido ofensivo o inapropiado» › Enviar.
8. Mantener presionado un mensaje de Mateo › **Bloquear a Mateo Ríos Calderón** › confirmar (sus mensajes
   desaparecen).
9. **Más › Usuarios bloqueados** › Desbloquear a Mateo.
10. **Más › Eliminar mi cuenta**: mostrar que abre la página de eliminación (no completarla).
11. **Más › Cerrar sesión**.

Pasar el video a la PC (AirDrop no existe en Windows: WhatsApp a ti mismo como documento, o iCloud
Fotos › descargar) y dejarlo en `Descargas`. Claude lo adjunta en la respuesta.

## Texto de la respuesta (inglés)

```text
Thank you for the review. Here is the information requested. The screen recording is attached (iPhone, latest iOS, starting from launching the app).

1. Screen recording: attached. It shows launching the app, signing in with the demo account, the main flows (home, approvals, tasks, team chat), reporting a message and blocking/unblocking a user in the chat, the account deletion entry point (More > "Eliminar mi cuenta") and signing out. There is no in-app account registration and no paid content.

2. Purpose and audience: ARTA is a work app for live-event production teams (concerts, festivals and shows) in Mexico. It is used by the staff and vendors of production companies on the ARTA platform; Arta Producciones (Puebla, Mexico) is the launch customer. It solves the coordination of each event: tasks with evidence and deadlines, team chat per event, and approval of tasks, purchase orders and cash advances from the phone, instead of scattered WhatsApp groups and spreadsheets.

3. Setup and access: no setup is needed. Sign in with the demo account in the App Review Information (revision.tiendas@artaproducciones.com). It belongs to an isolated demo organization with fictional data and has no two-factor authentication. Main features: Inicio (Home), Chats, Tareas (Tasks), Avisos (Notifications) and Más (More); approvals are under Inicio > Aprobaciones. Accounts are created by each organization's administrators; there is no public sign-up.

4. External services: the ARTA API operated by NEXARA (https://arta.artaproducciones.com) for authentication and data; Firebase Cloud Messaging and Apple Push Notification service for notifications. No payment processors, no advertising, no analytics or tracking SDKs, no AI services.

5. Regional differences: none. The app works the same in all regions; the interface is in Spanish.

6. Authorization: NEXARA (NEW ENGINEERING EXPERTISE AND RESOURCE ADVANCEMENT S.A. DE C.V.) develops and publishes the app for Arta Producciones S.A. de C.V. The signed authorization letter from Arta Producciones' legal representative is attached to the App Review Information. The app is not in a regulated industry.

User-generated content (Guideline 1.2): the chat is a closed workplace chat between members of the same organization. Users can report any message (long-press > "Reportar") and block a person (long-press > "Bloquear"; unblock in Más > Usuarios bloqueados). Reports reach the organization's administrators, who act within 24 hours and can delete messages and deactivate accounts. The terms of use (https://artaproducciones.com/legal/terminos) state zero tolerance for objectionable content.
```
