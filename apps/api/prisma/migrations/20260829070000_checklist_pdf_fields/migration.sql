-- Mapa de campos del PDF de checklist.
--
-- El PDF lo genera el propio sistema, así que puede registrar en qué página y
-- coordenadas escribió cada ítem. El panel usa ese mapa para poner un campo de
-- captura justo encima y así se escribe SOBRE el documento, en vez de en un
-- formulario aparte que lo controle.
--
-- Se llena en la siguiente regeneración de cada checklist; mientras esté en
-- NULL el panel cae a la vista de formulario.
ALTER TABLE "ChecklistInstance" ADD COLUMN "pdfFieldsJson" JSONB;
