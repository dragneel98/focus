export interface CycleCredit {
  creditedMinutes: number;
  isComplete: boolean;
}

export function estimateMinutesFromHours(hours: number): number {
  if (!Number.isFinite(hours) || hours <= 0) {
    throw new RangeError("La duración debe ser mayor que cero.");
  }

  const minutes = Math.round(hours * 60);
  if (minutes < 1) {
    throw new RangeError("La duración mínima es un minuto.");
  }
  return minutes;
}

export function creditCompletedCycle(
  estimateMinutes: number,
  creditedMinutes: number,
  cycleMinutes: number,
  completed: boolean,
): CycleCredit {
  if (!Number.isInteger(estimateMinutes) || estimateMinutes < 1) {
    throw new RangeError("La estimación debe ser de al menos un minuto.");
  }
  if (!Number.isInteger(creditedMinutes) || creditedMinutes < 0) {
    throw new RangeError("El tiempo acreditado no puede ser negativo.");
  }
  if (!Number.isInteger(cycleMinutes) || cycleMinutes < 1) {
    throw new RangeError("El ciclo debe durar al menos un minuto.");
  }

  if (!completed) {
    return { creditedMinutes, isComplete: creditedMinutes >= estimateMinutes };
  }

  const nextCredit = creditedMinutes + cycleMinutes;
  return { creditedMinutes: nextCredit, isComplete: nextCredit >= estimateMinutes };
}

export function getLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatMinutes(minutes: number): string {
  const safeMinutes = Math.max(0, Math.floor(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const remainder = safeMinutes % 60;
  if (hours === 0) return `${remainder} min`;
  if (remainder === 0) return `${hours} h`;
  return `${hours} h ${remainder} min`;
}
