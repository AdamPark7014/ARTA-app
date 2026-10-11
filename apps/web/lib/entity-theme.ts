/**
 * Tema por entidad (docs/diseno/SISTEMA-VISUAL.md): ARTA es claro, el Auditorio
 * oscuro. Los tokens viven en `styles/globals.scss` bajo `[data-entity]`, y el
 * atributo va en `<html>` para que modales, menús y avisos que se pintan fuera
 * del `.shell` hereden el mismo tema.
 *
 * Estos scripts corren antes del primer cuadro para que la página no aparezca
 * un instante con el tema equivocado. El subdominio manda (arta.* / auditorio.*,
 * igual que `entityFromHost`); fuera de él, el panel usa la última entidad
 * activa y el acceso queda en ARTA. Después React lo mantiene al día.
 */

const HOST_ENTITY =
  "var h=location.hostname.toLowerCase();" +
  "var e=/^auditorio\\./.test(h)?'EXPLANADA':/^arta\\./.test(h)?'ARTA':null;";

/** Panel: subdominio, o la última entidad que se usó en este navegador. */
export const PANEL_THEME_SCRIPT =
  '(function(){var d=document.documentElement;try{' +
  HOST_ENTITY +
  "if(!e)e=localStorage.getItem('arta_entity');" +
  "d.setAttribute('data-entity',e==='EXPLANADA'?'EXPLANADA':'ARTA');" +
  "}catch(_){d.setAttribute('data-entity','ARTA');}})();";

/** Acceso (login, invitación): solo el subdominio; por defecto ARTA. */
export const AUTH_THEME_SCRIPT =
  '(function(){var d=document.documentElement;try{' +
  HOST_ENTITY +
  "d.setAttribute('data-entity',e==='EXPLANADA'?'EXPLANADA':'ARTA');" +
  "}catch(_){d.setAttribute('data-entity','ARTA');}})();";
