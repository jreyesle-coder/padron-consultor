export type Lider = {
  id: number;
  cedula: string;
  nombre: string;
  celular: string | null;
  provincia: string | null;
  municipio: string | null;
  circunscripcion: number | null;
  colegio: string | null;
  parent_lider_id: number | null;
  meta_votos?: number;
  updated_at?: string | null;
};

export type Colaborador = {
  id: number;
  cedula: string;
  nombre: string;
  celular: string | null;
  colegio: string | null;
  provincia: string | null;
  municipio: string | null;
  sector: string | null;
  direccion: string | null;
  lat: number | null;
  lng: number | null;
  foto_url: string | null;
  lider_id: number | null;
  pendiente_padron?: boolean;
  padron_confirmado?: boolean;
  ultimo_contacto?: string | null;
  notas?: string | null;
  updated_at?: string | null;
  colegio_jce_id?: number | null;
};
