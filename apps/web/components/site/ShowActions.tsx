'use client';

import { useState } from 'react';

type ShowActionsProps = {
  title: string;
  calendar: { google: string; ics: string } | null;
};

/** Guardar el show en el calendario y compartirlo: lo que uno hace justo después de decidir que va a ir. */
export function ShowActions({ title, calendar }: ShowActionsProps) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = window.location.href;
    if (typeof navigator.share === 'function') {
      // Si cierran la hoja de compartir también rechaza: no es un error.
      await navigator.share({ title, url }).catch(() => undefined);
      return;
    }
    await navigator.clipboard?.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2400);
  }

  return (
    <div className="sa-showactions">
      {calendar ? (
        <>
          <a className="sa-arrow" href={calendar.google} target="_blank" rel="noopener noreferrer">
            Agregar a Google Calendar
          </a>
          <a className="sa-arrow" href={calendar.ics} download={`${title}.ics`}>
            Apple u Outlook
          </a>
        </>
      ) : null}
      <button type="button" className="sa-arrow" onClick={() => void share()}>
        {copied ? 'Liga copiada' : 'Compartir'}
      </button>
    </div>
  );
}
