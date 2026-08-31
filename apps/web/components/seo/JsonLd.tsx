type Props = {
  data: Record<string, unknown> | Array<Record<string, unknown>>;
};

/** Datos estructurados schema.org para rich results. */
export function JsonLd({ data }: Props) {
  const payload = Array.isArray(data) ? data : [data];
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(payload.length === 1 ? payload[0] : payload) }}
    />
  );
}
