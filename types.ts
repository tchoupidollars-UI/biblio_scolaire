
export type Level = '3e' | 'Seconde' | 'Première' | 'Terminale' | 'Coin du Bac' | 'Coin Externe';
export type Serie = 'C' | 'D' | 'A4' | 'Générale';
export type Sequence = '1ère Séquence' | '2e Séquence' | '3e Séquence' | '4e Séquence' | '5e Séquence' | '6e Séquence' | 'Epreuve Zéro';

export interface PdfDocument {
  id: string;
  name: string;
  url: string;
  comment: string;
  category: string;
  created_at: string; // Utilise le champ automatique de Supabase
}

export interface NavigationState {
  level?: Level;
  year?: string;
  serie?: Serie;
  subject?: string;
  sequence?: Sequence;
}

export const SUBJECTS_CD = [
  'MATHEMATIQUES', 'PHYSIQUE', 'CHIMIE', 'SVT', 'FRANCAIS', 'ANGLAIS', 'HISTOIRE', 'GEOGRAPHIE', 'ECM', 'PHILOSOPHIE'
];

export const SUBJECTS_A4 = [
  'MATHEMATIQUES', 'LITTERATURE', 'LANGUE', 'ANGLAIS', 'HISTOIRE', 'GEOGRAPHIE', 'ECM', 'PHILOSOPHIE', 'SVT'
];

export const SUBJECTS_3EME = [
  'MATHEMATIQUES', 'PCT', 'SVT', 'FRANCAIS', 'ANGLAIS', 'HISTOIRE', 'GEOGRAPHIE', 'ECM'
];

export const SEQUENCES = [
  '1ère Séquence', '2e Séquence', '3e Séquence', '4e Séquence', '5e Séquence', '6e Séquence', 'Epreuve Zéro'
];
