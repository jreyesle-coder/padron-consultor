import { supabase } from '@/lib/supabase';

export type ColegioPorCedula = {
  colegio_jce_id: number;
  colegio_codigo: string;
  recinto_nombre: string;
  municipio: string;
  provincia: string;
};

const normCed = (c: string) => c.replace(/\D/g, '').padStart(11, '0');

/**
 * Busca el colegio electoral de una cédula consultando padron_electoral
 * y luego cruzando con el catálogo JCE (colegios_jce + recintos_jce).
 *
 * Retorna null si la cédula no está en el padrón o su colegio no figura
 * en el catálogo JCE importado.
 */
export async function buscarColegioPorCedula(
  cedula: string
): Promise<ColegioPorCedula | null> {
  const cedNorm = normCed(cedula);
  if (cedNorm.replace(/0/g, '') === '') return null;

  // 1. Buscar en padrón electoral
  const { data: padron, error: errPadron } = await supabase
    .from('padron_electoral')
    .select('colegio')
    .eq('cedula', cedNorm)
    .maybeSingle();

  if (errPadron || !padron?.colegio) return null;

  const codigoBuscado = String(padron.colegio).trim();
  if (!codigoBuscado) return null;

  // 2. Cruzar con catálogo JCE
  const { data: colegio, error: errColegio } = await supabase
    .from('colegios_jce')
    .select(`
      id,
      codigo,
      recintos_jce (
        nombre,
        municipios (
          nombre,
          provincias ( nombre )
        )
      )
    `)
    .eq('codigo', codigoBuscado)
    .maybeSingle();

  if (errColegio || !colegio) return null;

  const recinto = colegio.recintos_jce as any;
  const municipio = recinto?.municipios as any;
  const provincia = municipio?.provincias as any;

  return {
    colegio_jce_id: colegio.id,
    colegio_codigo: colegio.codigo,
    recinto_nombre: recinto?.nombre ?? '',
    municipio:      municipio?.nombre ?? '',
    provincia:      provincia?.nombre ?? '',
  };
}
