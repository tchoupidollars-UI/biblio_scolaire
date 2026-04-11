import React, { useState, useCallback } from 'react';
import { 
  X, Sparkles, FileText, CheckCircle2, AlertCircle, 
  Loader2, UploadCloud, ChevronRight, Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as pdfjsLib from 'pdfjs-dist';

interface AgentUploadProps {
  supabase: any;
  ai: any;
  onClose: () => void;
  onSuccess: () => void;
}

interface UploadItem {
  id: string;
  file: File;
  status: 'pending' | 'analyzing' | 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
  newName?: string;
  category?: string;
}

const AgentUpload: React.FC<AgentUploadProps> = ({ supabase, ai, onClose, onSuccess }) => {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const extractTextFromPdf = async (file: File): Promise<string> => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      const maxPages = Math.min(pdf.numPages, 2); // Analyser les 2 premières pages
      let fullText = "";

      for (let i = 1; i <= maxPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        fullText += pageText + " ";
      }
      return fullText.substring(0, 3000); // Limiter à 3000 caractères
    } catch (e: any) {
      console.error("Erreur extraction PDF:", e);
      return `[ERROR: ${e.message || 'Unknown error'}]`;
    }
  };

  const processFile = async (item: UploadItem) => {
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'analyzing' } : i));

    try {
      // 1. Extraction du texte
      const text = await extractTextFromPdf(item.file);
      
      if (!text.trim() || text.startsWith('[ERROR:')) {
        throw new Error(text.startsWith('[ERROR:') ? text : "Impossible d'extraire le texte du PDF.");
      }

      // 2. Analyse par Gemini
      if (!ai) {
        throw new Error("La clé API Gemini n'est pas configurée. L'analyse automatique est désactivée.");
      }

      const prompt = `Tu es un expert en éducation au Cameroun. Analyse cet en-tête d'épreuve et extrais les informations suivantes pour classer le document.
      Structure de navigation attendue: Niveau > Année > Série > Matière > Séquence
      Exemples de catégories:
      - Coin du Bac > 2026 > D > SVT > Examen Blanc
      - Terminale > C > MATHEMATIQUES > Examen Blanc
      - 3e > MATHEMATIQUES > 1ère Séquence
      
      Règles:
      - Niveau: '3e', 'Seconde', 'Première', 'Terminale', 'Coin du Bac', 'Coin du Probatoire', 'Coin du BEPC'
      - Série: 'C', 'D', 'A4' (si applicable)
      - Matière: 'MATHEMATIQUES', 'PHYSIQUE', 'CHIMIE', 'SVT', 'FRANCAIS', 'ANGLAIS', 'HISTOIRE', 'GEOGRAPHIE', 'ECM', 'PHILOSOPHIE', 'PCT', 'LITTERATURE', 'LANGUE'
      - Séquence: '1ère Séquence', '2e Séquence', '3e Séquence', '4e Séquence', '5e Séquence', '6e Séquence', 'Examen Blanc', 'Examen Officiel'
      - Année: L'année mentionnée (ex: 2024, 2025, 2026)
      - Cas Spécial: Si le document mentionne "Epreuve Zéro", classe-le TOUJOURS dans la séquence 'Examen Blanc'.
      
      Réponds UNIQUEMENT en JSON avec ce format:
      {
        "newName": "Nom_Fichier_Propre",
        "category": "Niveau > Année > Série > Matière > Séquence"
      }
      
      Texte extrait: "${text}"`;

      const response = await ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: prompt
      });

      const resultText = response.text;
      
      const jsonMatch = resultText?.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Réponse IA invalide");
      
      const analysis = JSON.parse(jsonMatch[0]);
      const finalName = analysis.newName.replace('.pdf', '') + '.pdf';
      const finalCategory = analysis.category;

      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'uploading', newName: finalName, category: finalCategory } : i));

      // 3. Upload vers Supabase Storage
      const storagePath = `${Date.now()}_${finalName.replace(/[\s/\\:*?"<>|]/g, '_')}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('pdf-library')
        .upload(storagePath, item.file, {
          contentType: 'application/pdf',
          upsert: true
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('pdf-library')
        .getPublicUrl(storagePath);

      // 4. Insertion en DB
      const { error: dbError } = await supabase
        .from('pdfs')
        .insert([{
          name: finalName,
          url: publicUrl,
          category: finalCategory,
          comment: "Ajouté via Agent IA Batch Upload"
        }]);

      if (dbError) throw dbError;

      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'success', progress: 100 } : i));
    } catch (err: any) {
      console.error("Erreur traitement:", err);
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'error', error: err.message } : i));
    }
  };

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const newItems: UploadItem[] = Array.from(files).map(file => ({
      id: Math.random().toString(36).substring(7),
      file,
      status: 'pending',
      progress: 0
    }));
    setItems(prev => [...prev, ...newItems]);
  };

  const startUpload = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    
    const pending = items.filter(i => i.status === 'pending');
    
    // Traitement par lots de 3
    for (let i = 0; i < pending.length; i += 3) {
      const batch = pending.slice(i, i + 3);
      await Promise.all(batch.map(item => processFile(item)));
    }
    
    setIsProcessing(false);
    onSuccess();
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md"
    >
      <motion.div 
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="bg-white w-full max-w-4xl rounded-[40px] shadow-3xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-white">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-200">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-950 tracking-tighter uppercase">Agent IA — Upload Batch</h2>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Analyse et classement automatique par Intelligence Artificielle</p>
            </div>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-red-50 hover:text-red-500 rounded-xl transition-all">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 space-y-8 no-scrollbar">
          {items.length === 0 ? (
            <div 
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
              className="py-20 border-4 border-dashed border-slate-100 rounded-[40px] flex flex-col items-center justify-center group hover:border-indigo-600 hover:bg-indigo-50/30 transition-all cursor-pointer"
              onClick={() => document.getElementById('batch-file-input')?.click()}
            >
              <div className="p-8 bg-slate-50 rounded-full mb-6 group-hover:scale-110 transition-transform">
                <UploadCloud className="w-16 h-16 text-slate-300 group-hover:text-indigo-600 transition-colors" />
              </div>
              <p className="text-lg font-black text-slate-950 uppercase tracking-tighter">Glissez vos PDFs ici</p>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-2">Ou cliquez pour parcourir vos fichiers</p>
              <input 
                id="batch-file-input"
                type="file" 
                multiple 
                accept="application/pdf" 
                className="hidden" 
                onChange={(e) => handleFiles(e.target.files)}
              />
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => (
                <div key={item.id} className="p-6 bg-slate-50 rounded-[30px] border-2 border-transparent hover:border-indigo-100 transition-all flex items-center gap-6">
                  <div className={`p-4 rounded-2xl ${
                    item.status === 'success' ? 'bg-emerald-100 text-emerald-600' :
                    item.status === 'error' ? 'bg-red-100 text-red-600' :
                    'bg-indigo-100 text-indigo-600'
                  }`}>
                    {item.status === 'success' ? <CheckCircle2 className="w-6 h-6" /> :
                     item.status === 'error' ? <AlertCircle className="w-6 h-6" /> :
                     item.status === 'pending' ? <FileText className="w-6 h-6" /> :
                     <Loader2 className="w-6 h-6 animate-spin" />}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-black text-slate-950 truncate text-sm uppercase tracking-tight">
                        {item.newName || item.file.name}
                      </h4>
                      <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg ${
                        item.status === 'success' ? 'bg-emerald-50 text-emerald-600' :
                        item.status === 'error' ? 'bg-red-50 text-red-600' :
                        'bg-slate-200 text-slate-500'
                      }`}>
                        {item.status}
                      </span>
                    </div>
                    
                    {item.category && (
                      <div className="flex items-center gap-2 text-slate-400 text-[9px] font-bold uppercase tracking-widest mb-2">
                        <ChevronRight className="w-3 h-3" />
                        {item.category}
                      </div>
                    )}

                    {item.status === 'error' && (
                      <p className="text-red-500 text-[9px] font-bold uppercase tracking-widest">{item.error}</p>
                    )}

                    {item.status !== 'pending' && item.status !== 'success' && item.status !== 'error' && (
                      <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <motion.div 
                          className="h-full bg-indigo-600"
                          initial={{ width: 0 }}
                          animate={{ width: `${item.progress}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-8 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-4 text-slate-400">
            <Info className="w-5 h-5" />
            <p className="text-[10px] font-bold uppercase tracking-widest">
              {items.length} fichier(s) sélectionné(s)
            </p>
          </div>
          
          <div className="flex gap-4">
            <button 
              onClick={() => setItems([])}
              className="px-8 py-4 text-slate-400 font-black uppercase tracking-widest text-[11px] hover:text-slate-600 transition-all"
            >
              Vider la liste
            </button>
            <button 
              onClick={startUpload}
              disabled={isProcessing || items.length === 0 || items.every(i => i.status === 'success')}
              className="flex items-center gap-3 px-10 py-5 bg-slate-950 text-white rounded-[25px] font-black uppercase tracking-widest text-[11px] shadow-xl hover:bg-indigo-600 disabled:bg-slate-200 disabled:text-slate-400 transition-all"
            >
              {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
              Lancer l'Analyse & Upload
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default AgentUpload;
