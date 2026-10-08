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

Va en el hilo de App Review con la carta firmada adjunta (App Review Information solo admite un adjunto, y ahí va el video `ARTA-app-review-1.0.0-build6.mp4`, corrida `37653966259`). Las Notas llevan lo mismo resumido.

```text
Thank you for the review. Here is the information requested; the same text is now in the Notes field of the App Review Information section, and the submitted build adds in-app reporting and blocking in the chat.

1. Screen recording: attached in the App Review Information section (ARTA-app-review-1.0.0-build6.mp4). It was captured on the iOS Simulator (iPhone 17 Pro Max, iOS 26.2) with a simulator build of the same source code as the submitted build 1.0.0 (6), connected to the production server with the demo account. It starts by launching the app from the Home Screen and shows sign-in, Inicio (home), Aprobaciones (approvals), Tareas (tasks), the event chat (sending a message, reporting a message, blocking and unblocking a user), Más > "Eliminar mi cuenta" (the account deletion request, which opens https://artaproducciones.com/legal/eliminar-cuenta) and sign-out. There is no account registration in the app and no paid content.

2. Purpose and audience: ARTA is a work app for live-event production teams (concerts, festivals and shows) in Mexico, used by the staff and vendors of production companies; Arta Producciones (Puebla, Mexico) is the launch customer. It replaces scattered WhatsApp groups and spreadsheets to coordinate each event: tasks with evidence and deadlines, team chat per event, and approval of tasks, purchase orders and cash advances from the phone.

3. Setup and access: no setup or sample files are needed. Sign in with the demo account in Sign-in Information (revision.tiendas@artaproducciones.com). It belongs to an isolated demo organization with fictional data and has no two-factor authentication. Main sections: Inicio (Home), Chats, Tareas (Tasks), Avisos (Notifications) and Más (More); approvals are under Inicio > Aprobaciones. Accounts are created by each organization's administrators; there is no public sign-up.

4. External services: the ARTA API operated by NEXARA (https://arta.artaproducciones.com) for authentication and data; Firebase Cloud Messaging and Apple Push Notification service for notifications. No payment processors, advertising, analytics, tracking or AI services.

5. Regional differences: none. The app works the same in all regions; the interface is in Spanish.

6. Authorization: NEXARA (NEW ENGINEERING EXPERTISE AND RESOURCE ADVANCEMENT S.A. DE C.V.) develops and publishes the app for Arta Producciones S.A. de C.V. The authorization letter signed by Arta Producciones' legal representative is attached to this message. The app is not in a regulated industry.

User-generated content (Guideline 1.2): the chat is a closed workplace chat between members of the same organization. Users can report any message from another person (long-press > "Reportar") and block a person (long-press > "Bloquear a …"; unblock in Más > Usuarios bloqueados). Reports reach the organization's administrators, who act within 24 hours and can delete messages and deactivate accounts. The terms of use (https://artaproducciones.com/legal/terminos) state zero tolerance for objectionable content.
```
