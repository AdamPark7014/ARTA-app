type Props = {
  data: Record<string, unknown> | Array<Record<string, unknown>>;
};

/**
 * Datos estructurados schema.org para rich results. Títulos y textos vienen de Studio: se escapa `<`
 * para que un «</script>» en una noticia no pueda cerrar la etiqueta e inyectar HTML.
 */
export function JsonLd({ data }: Props) {
  const payload = Array.isArray(data) ? data : [data];
  const json = JSON.stringify(payload.length === 1 ? payload[0] : payload).replace(/</g, '\\u003c');
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
