'use client';

import { useState, type FormEvent } from 'react';

const TOPICS = ['Quiero producir un show', 'Patrocinios y marcas', 'Prensa y medios', 'Otro tema'];

/**
 * El formulario arma el correo en la app de quien escribe. No hay SMTP conectado en producción
 * (docs/AVISOS.md): un formulario que «envía» sin llegar a nadie sería peor que no tener ninguno.
 */
export function ContactForm({ email, whatsapp, submitLabel }: { email: string; whatsapp?: string; submitLabel: string }) {
  const [topic, setTopic] = useState(TOPICS[0]);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');

  const text = [`Hola, soy ${name.trim() || '(mi nombre)'}.`, '', message.trim()].join('\n').trim();

  function submit(e: FormEvent) {
    e.preventDefault();
    const subject = `${topic} · sitio web`;
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
  }

  return (
    <form className="sa-form" onSubmit={submit}>
      <label>
        <span>Tu nombre</span>
        <input name="nombre" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        <span>Sobre qué nos escribes</span>
        <select name="tema" value={topic} onChange={(e) => setTopic(e.target.value)}>
          {TOPICS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <label className="sa-form__wide">
        <span>Cuéntanos</span>
        <textarea
          name="mensaje"
          rows={4}
          required
          placeholder="Fecha, recinto y lo que tienes en mente"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </label>
      <div className="sa-form__actions">
        <button type="submit" className="sa-btn sa-btn--on-ink">
          {submitLabel}
        </button>
        {whatsapp ? (
          <a
            className="sa-btn sa-btn--ghost-ink"
            href={`https://wa.me/${whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Por WhatsApp
          </a>
        ) : null}
      </div>
    </form>
  );
}
