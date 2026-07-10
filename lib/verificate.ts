export interface VerificateResult {
  enPadron: boolean;
  nombre?: string;
  partido?: string;
  estado?: string;
  fechaConsulta: string;
}

/**
 * Consulta si una cédula está inscrita en el padrón PRM vía verificate.prm.do.
 * Sprint 0: stub que siempre retorna null. Sprint 1 implementará la llamada real.
 */
export async function verificarEnPRM(_cedula: string): Promise<VerificateResult | null> {
  return null;
}
