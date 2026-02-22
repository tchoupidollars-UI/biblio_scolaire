import React, { useState, useEffect, useMemo } from 'react';
import { 
  Menu, X, BookOpen, Plus, Trash2, Eye, Download, Star, GraduationCap, 
  FileText, Calendar, ChevronRight, School, Library, Compass, Award, 
  Globe, Sparkles, Cloud, RefreshCw, Search, Zap, CheckCircle2, AlertTriangle, ArrowLeft
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { createClient } from '@supabase/supabase-js';
import { 
  Level, Serie, Sequence, PdfDocument, NavigationState, 
  SUBJECTS_CD, SUBJECTS_A4, SUBJECTS_3EME, SEQUENCES 
} from './types';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || '';

const supabase = (SUPABASE_URL && SUPABASE_KEY) 
  ? createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

const THEME_KEY = 'edulib_theme_v8';

const App: React.FC = () => {
  const [pdfs, setPdfs] = useState<PdfDocument[]>([]);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [nav, setNav] = useState<NavigationState>({});
  const [bgColor, setBgColor] = useState(localStorage.getItem(THEME_KEY) || '#ffffff');
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [previewPdf, setPreviewPdf] = useState<PdfDocument | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const apiKey = process.env.API_KEY;
  const ai = useMemo(() => {
    if (!apiKey) return null;
    return new GoogleGenAI({ apiKey });
  }, [apiKey]);

  useEffect(() => {
    if (!supabase) return;
    const fetchPdfs = async () => {
      setIsSyncing(true);
      try {
        const { data, error } = await supabase.from('pdfs').select('*').order('created_at', { ascending: false });
        if (!error && data) setPdfs(data);
      } catch (e) { console.error(e); } finally { setIsSyncing(false); }
    };
    fetchPdfs();
    const channel = supabase.channel('realtime_pdfs').on('postgres_changes', { event: '*', schema: 'public', table: 'pdfs' }, fetchPdfs).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleAiCorrection = async (text: string): Promise<string> => {
    if (!text || text.length < 3 || !ai) return text;
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Corrige l'orthographe de ce titre scolaire : "${text}". Réponds UNIQUEMENT avec le texte corrigé.`,
      });
      return response.text?.trim() || text;
    } catch (e) { return text; }
  };

  const resetNav = () => { setNav({}); setSearchQuery(''); };
  const handleGoBack = () => {
    if (nav.sequence) setNav(p => ({ ...p, sequence: undefined }));
    else if (nav.subject) setNav(p => ({ ...p, subject: undefined }));
    else if (nav.serie) setNav(p => ({ ...p, serie: undefined }));
    else if (nav.year) setNav(p => ({ ...p, year: undefined }));
    else if (nav.level) setNav(p => ({ ...p, level: undefined }));
  };

  const currentPath = [nav.level, nav.year, nav.serie, nav.subject, nav.sequence].filter(Boolean).join(' > ');

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!supabase) {
      alert("❌ Erreur : Supabase n'est pas configuré. Vérifiez vos variables d'environnement.");
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const fileName = `${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage.from('pdf-library').upload(fileName, file);
      
      if (uploadError) {
        throw new Error(`Erreur Storage : ${uploadError.message}. Vérifiez que le bucket 'pdf-library' existe et est public.`);
      }

      const { data: urlData } = supabase.storage.from('pdf-library').getPublicUrl(fileName);
      const correctedName = await handleAiCorrection(file.name.replace('.pdf', ''));

      const newPdf = {
        id: Math.random().toString(36).substr(2, 9),
        name: correctedName + '.pdf',
        url: urlData.publicUrl,
        comment: '',
        category: currentPath
      };

      const { error: insertError } = await supabase.from('pdfs').insert([newPdf]);
      if (insertError) {
        throw new Error(`Erreur Table : ${insertError.message}. Vérifiez que la colonne 'category' existe dans votre table 'pdfs'.`);
      }

      alert("✅ Document ajouté avec succès !");
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (id: string, url: string) => {
    if (!supabase || !confirm("Supprimer ?")) return;
    setIsSyncing(true);
    try {
      await supabase.from('pdfs').delete().eq('id', id);
      const fileName = url.split('/').pop();
      if (fileName) await supabase.storage.from('pdf-library').remove([fileName]);
    } catch (err) { console.error(err); } finally { setIsSyncing(false); }
  };

  const handleUpdateComment = async (id: string, comment: string) => {
    if (!supabase) return;
    const corrected = await handleAiCorrection(comment);
    await supabase.from('pdfs').update({ comment: corrected }).eq('id', id);
  };

  const filteredPdfs = useMemo(() => {
    if (searchQuery) return pdfs.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));
    return pdfs.filter(p => p.category === currentPath);
  }, [pdfs, currentPath, searchQuery]);

  const getStyleForLevel = (l: Level) => {
    const s: Record<Level, { icon: any, color: string }> = {
      '3e': { icon: <School />, color: 'bg-orange-500' },
      'Seconde': { icon: <Library />, color: 'bg-emerald-500' },
      'Première': { icon: <Compass />, color: 'bg-blue-500' },
      'Terminale': { icon: <Award />, color: 'bg-purple-600' },
      'Coin du Bac': { icon: <GraduationCap />, color: 'bg-red-600' },
      'Coin Externe': { icon: <Globe />, color: 'bg-indigo-600' }
    };
    return s[l] || s['3e'];
  };

  return (
    <div className="min-h-screen transition-all duration-1000 font-sans text-slate-900" style={{ backgroundColor: bgColor }}>
      <header className="fixed top-0 left-0 right-0 h-20 sm:h-28 bg-white/70 backdrop-blur-3xl border-b border-slate-200/40 z-[90] flex items-center justify-between px-4 sm:px-16">
        <div className="flex items-center gap-4 sm:gap-8">
          <button onClick={() => setIsMenuOpen(true)} className="p-3 sm:p-5 bg-slate-950 text-white rounded-2xl sm:rounded-[28px] shadow-xl"><Menu className="w-6 h-6 sm:w-8 h-8" /></button>
          <div className="flex flex-col cursor-pointer" onClick={resetNav}>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tighter">EduLib</h1>
            <span className="text-[7px] sm:text-[9px] font-black text-slate-400 uppercase tracking-widest">NNOMO ZOGO MERLIN</span>
          </div>
        </div>
        <button onClick={() => isAdmin ? setIsAdmin(false) : setShowAdminLogin(true)} className={`px-4 sm:px-8 py-3 sm:py-4 rounded-xl text-[8px] sm:text-[10px] font-black uppercase tracking-widest transition-all ${isAdmin ? 'bg-red-600 text-white' : 'bg-slate-950 text-white'}`}>
          {isAdmin ? <><span className="sm:hidden">Off</span><span className="hidden sm:inline">Quitter Merlin</span></> : 'Admin'}
        </button>
      </header>

      <main className="pt-32 sm:pt-40 pb-56 px-4 sm:px-16 max-w-7xl mx-auto">
        <div className="mb-12 sm:mb-20">
          {!searchQuery && (
            <>
              <div className="flex items-center gap-3 sm:gap-5 text-[9px] sm:text-[11px] font-black text-slate-400 overflow-x-auto no-scrollbar py-2">
                <button onClick={resetNav} className="bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-50 whitespace-nowrap">Bibliothèque</button>
                {nav.level && <><ChevronRight className="w-3" /><span>{nav.level}</span></>}
                {nav.subject && <><ChevronRight className="w-3" /><span>{nav.subject}</span></>}
              </div>
              {nav.level && <button onClick={handleGoBack} className="mt-6 flex items-center gap-3 px-6 py-3 bg-slate-950 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest"><ArrowLeft className="w-4 h-4" /> Retour</button>}
              <div className="mt-8"><AdBanner type="horizontal" /></div>
            </>
          )}
        </div>

        {!nav.level ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-10">
            {(['3e', 'Seconde', 'Première', 'Terminale', 'Coin du Bac', 'Coin Externe'] as Level[]).map((l) => {
              const s = getStyleForLevel(l);
              return <NavCard key={l} title={l} icon={s.icon} colorClass={s.color} onClick={() => setNav({ level: l })} />;
            })}
            <AdBanner type="grid" />
          </div>
        ) : (
          <div className="space-y-16">
            <div className="flex justify-between items-end border-b pb-8">
               <h3 className="text-4xl font-black uppercase">{nav.subject || nav.level}</h3>
               {isAdmin && (
                <label className="px-8 py-4 bg-slate-950 text-white rounded-2xl font-black cursor-pointer hover:bg-indigo-600 transition-all">
                  + Ajouter
                  <input type="file" accept="application/pdf" className="hidden" onChange={handleFileUpload} />
                </label>
               )}
            </div>
            <div className="grid grid-cols-1 gap-12">
              {filteredPdfs.map(pdf => <PdfCard key={pdf.id} pdf={pdf} isAdmin={isAdmin} onDelete={() => handleDelete(pdf.id, pdf.url)} onPreview={() => setPreviewPdf(pdf)} onUpdateComment={handleUpdateComment} />)}
              <AdBanner type="horizontal" />
            </div>
          </div>
        )}
      </main>

      {previewPdf && (
        <div className="fixed inset-0 z-[400] flex flex-col bg-slate-950 p-4 sm:p-12">
          <div className="flex items-center justify-between p-10 bg-white/5 rounded-t-[50px] text-white">
            <span className="text-2xl font-black">{previewPdf.name}</span>
            <button onClick={() => setPreviewPdf(null)} className="p-6 bg-white/10 rounded-[30px]"><X className="w-10 h-10" /></button>
          </div>
          <div className="flex-1 bg-white rounded-b-[50px] overflow-hidden flex flex-col">
            <iframe src={`${previewPdf.url}#toolbar=0`} className="w-full h-full border-none" />
            <div className="bg-slate-50 p-4 border-t"><AdBanner type="horizontal" /></div>
          </div>
        </div>
      )}
    </div>
  );
};

const NavCard: React.FC<{ title: string, icon: any, colorClass: string, onClick: () => void }> = ({ title, icon, colorClass, onClick }) => (
  <button onClick={onClick} className="group flex flex-col items-start p-8 sm:p-14 bg-white border-2 border-slate-50 rounded-[40px] sm:rounded-[70px] text-left hover:shadow-2xl transition-all">
    <div className={`p-6 sm:p-10 ${colorClass} text-white rounded-3xl sm:rounded-[40px] mb-8`}>
      {React.cloneElement(icon as React.ReactElement<any>, { className: 'w-8 h-8 sm:w-12 h-12' })}
    </div>
    <h2 className="text-2xl sm:text-4xl font-black text-slate-950 uppercase">{title}</h2>
  </button>
);

const PdfCard: React.FC<{ pdf: PdfDocument, isAdmin: boolean, onDelete: () => void, onPreview: () => void, onUpdateComment: (id: string, c: string) => void }> = ({ pdf, isAdmin, onDelete, onPreview, onUpdateComment }) => (
  <div className="bg-white rounded-[40px] sm:rounded-[60px] p-6 sm:p-12 shadow-xl border-2 border-slate-50">
    <div className="flex flex-col xl:flex-row justify-between gap-8">
      <div className="flex items-center gap-6">
        <div className="p-6 bg-red-50 text-red-600 rounded-3xl"><FileText className="w-8 h-8 sm:w-14 h-14" /></div>
        <span className="font-black text-lg sm:text-2xl uppercase">{pdf.name}</span>
      </div>
      <div className="flex gap-3">
        <button onClick={onPreview} className="flex-1 px-6 py-4 bg-slate-950 text-white font-black rounded-2xl uppercase text-[9px] sm:text-[11px]">Aperçu</button>
        <button onClick={() => window.open(pdf.url, '_blank')} className="p-4 bg-slate-50 rounded-2xl"><Download className="w-6 h-6" /></button>
        {isAdmin && <button onClick={onDelete} className="p-4 bg-red-50 text-red-500 rounded-2xl"><Trash2 className="w-6 h-6" /></button>}
      </div>
    </div>
    <div className="mt-8 pt-8 border-t-2 border-slate-50">
      {isAdmin ? (
        <textarea defaultValue={pdf.comment} onBlur={(e) => onUpdateComment(pdf.id, e.target.value)} placeholder="Ajoutez votre note ici..." className="w-full bg-slate-50 p-6 rounded-3xl text-lg font-bold h-32 outline-none" />
      ) : (
        <p className="text-sm sm:text-[18px] text-slate-800 font-bold italic">{pdf.comment || "Consultez ce document pour vos révisions."}</p>
      )}
    </div>
  </div>
);

const AdBanner: React.FC<{ type: 'horizontal' | 'sidebar' | 'grid' }> = ({ type }) => {
  useEffect(() => { try { (window as any).adsbygoogle = ((window as any).adsbygoogle || []).push({}); } catch (e) {} }, []);
  return (
    <div className={`w-full ${type === 'grid' ? 'min-h-[300px]' : 'min-h-[120px]'} bg-slate-50 rounded-[40px] border-2 border-dashed border-slate-200 flex items-center justify-center p-6 relative overflow-hidden`}>
      <ins className="adsbygoogle" style={{ display: 'block' }} data-ad-client="ca-pub-YOUR_CLIENT_ID" data-ad-slot="YOUR_AD_SLOT_ID" data-ad-format="auto" data-full-width-responsive="true"></ins>
      <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest">Espace Publicitaire</span>
    </div>
  );
};

export default App;