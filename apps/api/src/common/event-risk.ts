/**
 * Riesgo de un evento — implementación ÚNICA (escaneo horario, inicio y analítica).
 *
 * Adam, 07-11-2026: «riesgo solo si falta una semana o dos para el evento y todavía no hay un progreso
 * suficiente». Antes bastaba un avance menor a 40 % para marcarlo, aunque faltaran 111 días o el evento
 * ya hubiera pasado, y llegaba un aviso diario por evento a toda la dirección.
 *
 * Fuera de la ventana, sin fecha o con el evento cerrado o pasado, no hay riesgo. Cada organización
 * ajusta los umbrales en `Organization.settingsJson.riesgo` (pantalla Organizaciones).
 */

export type RiskLevel = 'critical' | 'watch' | 'healthy';

export type RiskRule = {
  /** Días o menos para el evento. */
  dias: number;
  /** Avance mínimo (%) para no marcarlo. */
  minimo: number;
};

export type RiskRules = { urgente: RiskRule; revisar: RiskRule };

export const DEFAULT_RISK_RULES: RiskRules = {
  urgente: { dias: 7, minimo: 80 },
  revisar: { dias: 14, minimo: 60 },
};

const clampInt = (value: unknown, min: number, max: number): number | null => {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, Math.round(n)));
};

function ruleOf(raw: unknown, fallback: RiskRule): RiskRule {
  if (!raw || typeof raw !== 'object') return fallback;
  const r = raw as Record<string, unknown>;
  return {
    dias: clampInt(r.dias, 1, 90) ?? fallback.dias,
    minimo: clampInt(r.minimo, 1, 100) ?? fallback.minimo,
  };
}

/**
 * Los umbrales de una organización, ya validados. «Revisar» nunca queda más cerca del evento que
 * «Urgente»: si alguien los cruza, se toma la ventana mayor para revisar.
 */
export function riskRulesOf(settingsJson: unknown): RiskRules {
  const raw =
    settingsJson && typeof settingsJson === 'object'
      ? (settingsJson as Record<string, unknown>).riesgo
      : null;
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const urgente = ruleOf(r.urgente, DEFAULT_RISK_RULES.urgente);
  const revisar = ruleOf(r.revisar, DEFAULT_RISK_RULES.revisar);
  return { urgente, revisar: { ...revisar, dias: Math.max(revisar.dias, urgente.dias) } };
}

/**
 * Nivel de riesgo con el avance medio de sus formatos y los días que faltan (negativo si ya
 * empezó). `done` es `isEventDone`: un evento cerrado o pasado ya está al 100 %.
 */
export function eventRisk(
  input: { avg: number; days: number | null; done?: boolean },
  rules: RiskRules = DEFAULT_RISK_RULES,
): RiskLevel {
  if (input.done || input.days == null || input.days < 0) return 'healthy';
  if (input.days <= rules.urgente.dias && input.avg < rules.urgente.minimo) return 'critical';
  if (input.days <= rules.revisar.dias && input.avg < rules.revisar.minimo) return 'watch';
  return 'healthy';
}
