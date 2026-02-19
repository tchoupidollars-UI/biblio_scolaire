
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Menu, X, BookOpen, Plus, Trash2, Eye, Download, Star, GraduationCap, 
  FileText, Calendar, ChevronRight, School, Library, Compass, Award, 
  Globe, Sparkles, Cloud, RefreshCw, Search, Zap, CheckCircle2, AlertTriangle
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { createClient } from '@supabase/supabase-js';
import { 
  Level, Serie, Sequence, PdfDocument, NavigationState, 
  SUBJECTS_CD, SUBJECTS_A4, SUBJECTS_3EME, SEQUENCES 
} from './types';

// Connexion Cloud Merlin (Supabase)
const SUPABASE_URL = 'https://uyfzahaisojusfgjuqmi.supabase.co';
const SUPABASE_KEY = 'sb_publishable_tuSWOGY5GeyqcLrQ4DFJgg_kWOHvKeR';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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

  // Vérification de la clé API pour aider Merlin à debugger sur Vercel
  const apiKey = process.env.API_KEY;
  const ai = useMemo(() => {
    if (!apiKey) return null;
    return new GoogleGenAI({ apiKey });
  }, [apiKey]);

  // Synchronisation Temps Réel
  useEffect(() => {
    const fetchPdfs = async () => {
      setIsSyncing(true);
      try {
        const { data, error } = await supabase.from('pdfs').select('*').order('created_at', { ascending: false });
        if (!error && data) {
          setPdfs(data);
        }
      } catch (e) {
        console.error("Erreur de synchro Supabase:", e);
      } finally {
        setIsSyncing(false);
      }
    };

    fetchPdfs();

    const channel = supabase.channel('realtime_pdfs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pdfs' }, fetchPdfs)
      .subscribe();
      
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleAiCorrection = async (text: string): Promise<string> => {
    if (!text || text.length < 3 || !ai) return text;
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Tu es un correcteur orthographique pour une application scolaire camerounaise. Corrige l'orthographe de ce titre ou commentaire : "${text}". Réponds UNIQUEMENT avec le texte corrigé, sans ponctuation inutile autour.`,
      });
      return response.text?.trim() || text;
    } catch (e) { return text; }
  };

  const resetNav = () => { setNav({}); setSearchQuery(''); };
  const currentPath = [nav.level, nav.year, nav.serie, nav.subject, nav.sequence].filter(Boolean).join(' > ');

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (nav.level === 'Coin du Bac') {
      const existingInPath = pdfs.filter(p => p.category === currentPath).length;
      if (existingInPath >= 2) {
        alert("🔒 Limite atteinte : Le Coin du Bac est limité à maximum 2 documents par rubrique.");
        return;
      }
    }

    setIsUploading(true);
    try {
      const fileName = `${Date.now()}_${file.name}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('pdf-library')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('pdf-library').getPublicUrl(fileName);
      const publicUrl = urlData.publicUrl;

      const correctedName = await handleAiCorrection(file.name.replace('.pdf', ''));

      const newPdf = {
        id: Math.random().toString(36).substr(2, 9),
        name: correctedName + '.pdf',
        url: publicUrl,
        comment: '',
        category: currentPath
      };

      const { error: dbError } = await supabase.from('pdfs').insert([newPdf]);
      if (dbError) throw dbError;

    } catch (err: any) {
      alert("Erreur d'envoi : " + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (id: string, url: string) => {
    if (!confirm("Supprimer définitivement ce document du Cloud ?")) return;
    setIsSyncing(true);
    try {
      await supabase.from('pdfs').delete().eq('id', id);
      const fileName = url.split('/').pop();
      if (fileName) await supabase.storage.from('pdf-library').remove([fileName]);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUpdateComment = async (id: string, comment: string) => {
    const corrected = await handleAiCorrection(comment);
    await supabase.from('pdfs').update({ comment: corrected }).eq('id', id);
  };

  const filteredPdfs = useMemo(() => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return pdfs.filter(p => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
    }
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
    <div className="min-h-screen transition-all duration-1000 ease-in-out font-sans text-slate-900 overflow-x-hidden" style={{ backgroundColor: bgColor }}>
      
      {/* Alerte Clé API Manquante */}
      {!apiKey && (
        <div className="fixed top-0 left-0 right-0 bg-red-600 text-white text-[10px] font-black uppercase tracking-[0.3em] py-2 px-6 z-[300] flex items-center justify-center gap-4">
          <AlertTriangle className="w-4 h-4" /> 
          Attention Merlin : La clé API n'est pas configurée dans Vercel !
        </div>
      )}

      {/* Barre de Progression Cloud */}
      {(isSyncing || isUploading) && (
        <div className="fixed top-0 left-0 right-0 h-1.5 z-[200]">
          <div className="h-full bg-gradient-to-r from-indigo-600 via-purple-500 to-pink-500 animate-gradient-x w-full" />
        </div>
      )}

      {/* Header Premium */}
      <header className="fixed top-0 left-0 right-0 h-28 bg-white/70 backdrop-blur-3xl border-b border-slate-200/40 z-[90] flex items-center justify-between px-6 sm:px-16">
        <div className="flex items-center gap-8">
          <button 
            onClick={() => setIsMenuOpen(true)} 
            className="group p-5 bg-slate-950 text-white rounded-[28px] hover:scale-110 active:scale-95 transition-all shadow-2xl shadow-indigo-200"
          >
            <Menu className="w-8 h-8 group-hover:rotate-180 transition-transform duration-500" />
          </button>
          <div className="flex flex-col cursor-pointer select-none" onClick={resetNav}>
            <div className="flex items-center gap-2">
              <h1 className="text-4xl font-black tracking-tighter text-slate-950">EduLib</h1>
              <div className="px-2.5 py-1 bg-indigo-600 text-[9px] font-black text-white rounded-lg uppercase tracking-tighter animate-pulse">Live</div>
            </div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] leading-none mt-1.5">Cloud de Merlin</span>
          </div>
        </div>

        <div className="hidden lg:flex flex-1 max-w-xl mx-16 relative">
          <Search className="absolute left-7 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
          <input 
            type="text" 
            placeholder="Rechercher une épreuve (ex: Maths Terminale D)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-16 pr-8 py-5 bg-slate-50 border-2 border-slate-100 rounded-[30px] text-sm font-bold focus:bg-white focus:border-indigo-600 outline-none transition-all shadow-inner"
          />
        </div>

        <button 
          onClick={() => isAdmin ? setIsAdmin(false) : setShowAdminLogin(true)}
          className={`px-10 py-4.5 rounded-[26px] text-[10px] font-black uppercase tracking-widest transition-all ${
            isAdmin ? 'bg-red-600 text-white shadow-red-200 shadow-2xl' : 'bg-slate-950 text-white hover:bg-indigo-600 shadow-xl'
          }`}
        >
          {isAdmin ? 'Quitter Merlin' : 'Admin'}
        </button>
      </header>

      {/* Menu Latéral Custom */}
      <div className={`fixed inset-0 z-[120] transition-all duration-700 ${isMenuOpen ? 'visible opacity-100' : 'invisible opacity-0'}`}>
        <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-xl" onClick={() => setIsMenuOpen(false)} />
        <div className={`absolute top-0 left-0 bottom-0 w-full max-w-[400px] bg-white shadow-3xl transition-transform duration-700 ease-[cubic-bezier(0.2,1,0.3,1)] ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="p-14 h-full flex flex-col">
            <div className="flex justify-between items-center mb-20">
              <span className="text-3xl font-black text-slate-950">Menu <span className="text-indigo-600">EduLib</span></span>
              <button onClick={() => setIsMenuOpen(false)} className="p-5 bg-slate-50 rounded-3xl hover:bg-red-50 hover:text-red-500 transition-all">
                <X className="w-8 h-8" />
              </button>
            </div>
            
            <div className="space-y-16 flex-1 overflow-y-auto no-scrollbar">
              <section>
                <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-[0.5em] mb-8">Atmosphère</h4>
                <div className="grid grid-cols-2 gap-5">
                  {[
                    { c: '#ffffff', n: 'Mode Clair' },
                    { c: '#f8fafc', n: 'Ardoise' },
                    { c: '#f0f9ff', n: 'Ciel' },
                    { c: '#fffbeb', n: 'Sable' }
                  ].map(t => (
                    <button key={t.c} onClick={() => { setBgColor(t.c); localStorage.setItem(THEME_KEY, t.c); }} className={`p-6 rounded-[35px] border-4 flex flex-col items-center gap-3 transition-all ${bgColor === t.c ? 'border-indigo-600 bg-indigo-50/50' : 'border-slate-50'}`}>
                      <div className="w-8 h-8 rounded-full border-2 border-white shadow-lg" style={{ backgroundColor: t.c }} />
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t.n}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="p-10 bg-gradient-to-br from-indigo-600 to-purple-700 text-white rounded-[45px] shadow-2xl relative overflow-hidden group cursor-pointer" onClick={() => window.open('https://play.google.com', '_blank')}>
                <Star className="absolute -right-6 -bottom-6 w-32 h-32 text-white/10 group-hover:scale-125 transition-transform duration-1000" />
                <h5 className="font-black text-sm uppercase tracking-[0.3em] mb-2">Notez l'application</h5>
                <p className="text-[11px] opacity-70 leading-relaxed uppercase tracking-wider">Aidez-nous à grandir sur le Store !</p>
              </section>
            </div>

            <div className="pt-12 border-t border-slate-100 mt-auto text-center">
              <p className="text-[10px] text-slate-300 font-black uppercase tracking-[0.6em] mb-5">Application créée par</p>
              <p className="text-slate-950 font-black text-xl tracking-tighter uppercase">NNOMO ZOGO MERLIN RAYAN</p>
            </div>
          </div>
        </div>
      </div>

      <main className="pt-40 pb-56 px-6 sm:px-16 max-w-7xl mx-auto">
        <div className="mb-20">
          {!searchQuery && (
            <div className="flex items-center gap-5 text-[12px] font-black text-slate-400 overflow-x-auto no-scrollbar py-2">
              <button onClick={resetNav} className="hover:text-indigo-600 transition-colors uppercase tracking-[0.4em] bg-white px-10 py-4 rounded-[22px] shadow-sm border border-slate-50 whitespace-nowrap">Bibliothèque</button>
              {nav.level && <><ChevronRight className="w-5 h-5 text-slate-200" /><span className="text-indigo-600 uppercase tracking-[0.4em] bg-white px-10 py-4 rounded-[22px] border border-indigo-100 shadow-sm whitespace-nowrap">{nav.level}</span></>}
              {nav.year && <><ChevronRight className="w-5 h-5 text-slate-200" /><span className="text-red-600 uppercase tracking-[0.4em] bg-white px-10 py-4 rounded-[22px] border border-red-100 shadow-sm whitespace-nowrap">{nav.year}</span></>}
              {nav.serie && <><ChevronRight className="w-5 h-5 text-slate-200" /><span className="text-purple-600 uppercase tracking-[0.4em] bg-white px-10 py-4 rounded-[22px] border border-purple-100 shadow-sm whitespace-nowrap">Série {nav.serie}</span></>}
              {nav.subject && <><ChevronRight className="w-5 h-5 text-slate-200" /><span className="text-emerald-600 uppercase tracking-[0.4em] bg-white px-10 py-4 rounded-[22px] border border-emerald-100 shadow-sm whitespace-nowrap">{nav.subject}</span></>}
            </div>
          )}
        </div>

        {searchQuery ? (
          <div className="space-y-12 animate-in fade-in slide-in-from-bottom-5 duration-700">
            <h2 className="text-5xl font-black tracking-tighter text-slate-950">Exploration <span className="text-indigo-600">Cloud</span></h2>
            <div className="grid grid-cols-1 gap-12">
              {filteredPdfs.map(pdf => <PdfCard key={pdf.id} pdf={pdf} isAdmin={isAdmin} onDelete={() => handleDelete(pdf.id, pdf.url)} onPreview={() => setPreviewPdf(pdf)} onUpdateComment={handleUpdateComment} />)}
            </div>
          </div>
        ) : !nav.level ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-12">
            {(['3e', 'Seconde', 'Première', 'Terminale', 'Coin du Bac', 'Coin Externe'] as Level[]).map((l) => {
              const s = getStyleForLevel(l);
              return <NavCard key={l} title={l} icon={s.icon} colorClass={s.color} onClick={() => setNav({ level: l })} />;
            })}
          </div>
        ) : nav.level === 'Coin du Bac' && !nav.year ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
            {Array.from({ length: 2025 - 2018 + 1 }, (_, i) => (2025 - i).toString()).map(y => (
              <NavCard key={y} title={y} icon={<Calendar />} colorClass="bg-red-600" onClick={() => setNav(p => ({ ...p, year: y }))} />
            ))}
          </div>
        ) : nav.level === 'Coin du Bac' && nav.year && !nav.serie ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {(['C', 'D', 'A4'] as Serie[]).map(s => (
              <NavCard key={s} title={`Série ${s}`} icon={<Award />} colorClass="bg-purple-600" onClick={() => setNav(p => ({ ...p, serie: s }))} />
            ))}
          </div>
        ) : nav.level === 'Terminale' && !nav.serie ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {(['C', 'D', 'A4'] as Serie[]).map(s => (
              <NavCard key={s} title={`Série ${s}`} icon={<Award />} colorClass="bg-purple-600" onClick={() => setNav(p => ({ ...p, serie: s }))} />
            ))}
          </div>
        ) : (nav.level === 'Première' || nav.level === 'Seconde') && !nav.serie ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            {(nav.level === 'Seconde' ? ['C', 'A4'] : ['C', 'D', 'A4'] as Serie[]).map(s => (
              <NavCard key={s} title={`Série ${s}`} icon={<Award />} colorClass="bg-purple-600" onClick={() => setNav(p => ({ ...p, serie: s }))} />
            ))}
          </div>
        ) : nav.level && nav.level !== 'Coin Externe' && (nav.level === '3e' || nav.serie) && !nav.subject ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {(nav.level === '3e' ? SUBJECTS_3EME : nav.serie === 'A4' ? SUBJECTS_A4 : SUBJECTS_CD).map(subj => (
              <NavCard key={subj} title={subj} icon={<Sparkles />} colorClass="bg-emerald-600" onClick={() => setNav(p => ({ ...p, subject: subj }))} />
            ))}
          </div>
        ) : nav.level && nav.level !== 'Coin Externe' && nav.subject && !nav.sequence && nav.level !== 'Coin du Bac' ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
            {SEQUENCES.filter(s => nav.level === 'Seconde' ? s !== 'Epreuve Zéro' : true).map(seq => (
              <NavCard key={seq} title={seq} icon={<Zap />} colorClass="bg-blue-600" onClick={() => setNav(p => ({ ...p, sequence: seq as Sequence }))} />
            ))}
          </div>
        ) : (
          <div className="space-y-16 animate-in fade-in duration-1000">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-12 border-b border-slate-200/40 pb-16">
              <div className="flex flex-col">
                <h3 className="text-6xl font-black text-slate-950 tracking-tighter uppercase leading-none mb-6">
                  {nav.sequence || nav.subject || nav.year || nav.level}
                </h3>
                <div className="px-6 py-3 bg-indigo-50 text-indigo-600 rounded-full text-[11px] font-black uppercase tracking-[0.4em] border border-indigo-100 inline-flex items-center gap-3 w-fit">
                  <Cloud className="w-4 h-4" /> Cloud Merlin en Direct
                </div>
              </div>
              {isAdmin && (
                <label className={`flex items-center gap-6 px-12 py-7 rounded-[40px] font-black cursor-pointer transition-all shadow-3xl active:scale-95 group ${isUploading ? 'bg-slate-400 animate-pulse' : 'bg-slate-950 text-white hover:bg-indigo-600'}`}>
                  {isUploading ? <RefreshCw className="w-10 h-10 animate-spin" /> : <Plus className="w-10 h-10" />}
                  <span className="uppercase tracking-[0.3em] text-[11px]">{isUploading ? 'Envoi...' : 'Ajouter un Document'}</span>
                  {!isUploading && <input type="file" accept="application/pdf" className="hidden" onChange={handleFileUpload} />}
                </label>
              )}
            </div>

            <div className="grid grid-cols-1 gap-12">
              {filteredPdfs.length === 0 ? (
                <div className="py-56 flex flex-col items-center justify-center bg-white/40 backdrop-blur-3xl rounded-[100px] border-4 border-dashed border-slate-100 text-slate-200 group">
                  <BookOpen className="w-24 h-24 mb-10 opacity-10 group-hover:scale-125 group-hover:opacity-30 transition-all duration-1000" />
                  <p className="font-black uppercase tracking-[0.6em] text-sm">Espace vide pour le moment</p>
                </div>
              ) : (
                filteredPdfs.map(pdf => <PdfCard key={pdf.id} pdf={pdf} isAdmin={isAdmin} onDelete={() => handleDelete(pdf.id, pdf.url)} onPreview={() => setPreviewPdf(pdf)} onUpdateComment={handleUpdateComment} />)
              )}
            </div>
          </div>
        )}

        {/* Footer Merlin */}
        <div className="mt-64 pt-32 border-t border-slate-100 text-center relative">
            <div className="inline-block relative mb-16 group">
               <div className="absolute -inset-12 bg-indigo-500 rounded-[80px] blur-[100px] opacity-10 group-hover:opacity-40 transition-opacity duration-1000" />
               <div className="relative px-24 py-12 bg-white shadow-3xl rounded-[60px] border border-slate-50">
                  <span className="text-[11px] font-black text-indigo-400 uppercase tracking-[0.6em] block mb-4">CRÉÉ PAR</span>
                  <span className="text-4xl font-black tracking-tighter text-slate-950 uppercase">NNOMO ZOGO MERLIN RAYAN</span>
               </div>
            </div>
            <p className="text-[11px] font-black text-slate-300 uppercase tracking-[1.2em] ml-[1.2em]">© 2025 Edulib Cloud • Excellence Académique</p>
        </div>
      </main>

      {/* Login Admin */}
      {showAdminLogin && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-3xl animate-in fade-in duration-700">
          <div className="w-full max-w-xl bg-white rounded-[70px] p-20 shadow-3xl animate-in zoom-in-95 duration-700">
            <h3 className="text-5xl font-black text-slate-950 tracking-tighter text-center mb-16">Accès <span className="text-indigo-600">Merlin</span></h3>
            <form onSubmit={(e) => { e.preventDefault(); if (adminPassword === 'merlin2025') { setIsAdmin(true); setShowAdminLogin(false); setAdminPassword(''); } else { alert("Code secret erroné."); } }} className="space-y-10">
              <input 
                type="password" placeholder="Code secret..." value={adminPassword} 
                onChange={(e) => setAdminPassword(e.target.value)} autoFocus
                className="w-full px-8 py-8 bg-slate-50 border-3 border-slate-100 rounded-[40px] font-black text-3xl text-center focus:border-indigo-600 outline-none shadow-inner"
              />
              <div className="flex gap-6">
                <button type="button" onClick={() => setShowAdminLogin(false)} className="flex-1 py-7 bg-slate-100 text-slate-500 font-black rounded-[40px] uppercase text-[11px] tracking-widest">Retour</button>
                <button type="submit" className="flex-[2] py-7 bg-slate-950 text-white font-black rounded-[40px] uppercase text-[11px] tracking-[0.3em] shadow-2xl shadow-indigo-200">Déverrouiller</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lecteur PDF Plein Écran (Aperçu) */}
      {previewPdf && (
        <div className="fixed inset-0 z-[400] flex flex-col bg-slate-950 p-4 sm:p-12 animate-in slide-in-from-bottom-32 duration-1000">
          <div className="flex flex-col sm:flex-row items-center justify-between p-12 bg-white/5 border border-white/10 rounded-t-[70px] text-white">
            <div className="flex items-center gap-12">
              <div className="p-9 bg-red-600 rounded-[40px] shadow-3xl"><FileText className="w-14 h-14" /></div>
              <div className="flex flex-col">
                <span className="text-3xl font-black tracking-tight line-clamp-1">{previewPdf.name}</span>
                <span className="text-[12px] font-black text-slate-400 uppercase tracking-[0.6em] mt-3 flex items-center gap-3">
                  <Cloud className="w-4 h-4" /> Lecteur Cloud EduLib
                </span>
              </div>
            </div>
            <button onClick={() => setPreviewPdf(null)} className="p-9 bg-white/10 hover:bg-red-600 text-white rounded-[40px] transition-all"><X className="w-12 h-12" /></button>
          </div>
          <div className="flex-1 bg-white rounded-b-[70px] overflow-hidden shadow-2xl">
            <iframe src={`${previewPdf.url}#toolbar=0`} className="w-full h-full border-none" title="Aperçu EduLib" />
          </div>
        </div>
      )}

      {/* Copyright Footer Fixe */}
      <footer className="fixed bottom-0 left-0 right-0 h-16 bg-white/40 backdrop-blur-3xl border-t border-slate-100/30 z-[70] flex items-center justify-center pointer-events-none">
        <span className="text-[11px] font-black text-slate-400 uppercase tracking-[1.5em] opacity-30 translate-x-[0.7em]">NNOMO ZOGO MERLIN RAYAN</span>
      </footer>
    </div>
  );
};

const NavCard: React.FC<{ title: string, icon: any, colorClass: string, onClick: () => void }> = ({ title, icon, colorClass, onClick }) => (
  <button onClick={onClick} className="group w-full flex flex-col items-start p-16 bg-white border-2 border-slate-50 rounded-[85px] text-left hover:shadow-3xl hover:-translate-y-6 transition-all duration-700 relative overflow-hidden active:scale-95">
    <div className={`absolute -top-24 -right-24 w-96 h-96 ${colorClass} opacity-[0.05] rounded-full blur-[120px] group-hover:opacity-15 transition-opacity duration-1000`} />
    <div className="flex items-center justify-between w-full mb-16 relative z-10">
      <div className={`p-11 ${colorClass} text-white rounded-[45px] shadow-2xl transition-all duration-700 group-hover:scale-125 group-hover:rotate-12`}>
        {React.cloneElement(icon as React.ReactElement, { className: 'w-14 h-14' })}
      </div>
      <div className="p-7 bg-slate-50 group-hover:bg-slate-950 group-hover:text-white rounded-[32px] transition-all duration-500"><ChevronRight className="w-10 h-10" /></div>
    </div>
    <div className="relative z-10 w-full mt-auto">
      <h2 className="text-4xl font-black text-slate-950 tracking-tighter mb-6 uppercase leading-tight">{title}</h2>
      <div className="flex items-center gap-6">
         <div className={`h-2.5 ${colorClass} rounded-full group-hover:w-40 w-16 transition-all duration-700 shadow-sm`} />
         <span className="text-[12px] font-black text-slate-300 uppercase tracking-[0.3em]">Accéder</span>
      </div>
    </div>
  </button>
);

const PdfCard: React.FC<{ pdf: PdfDocument, isAdmin: boolean, onDelete: () => void, onPreview: () => void, onUpdateComment: (id: string, c: string) => void }> = ({ pdf, isAdmin, onDelete, onPreview, onUpdateComment }) => (
  <div className="group bg-white rounded-[70px] p-14 shadow-2xl shadow-slate-100/40 border-2 border-slate-50 hover:border-indigo-100 transition-all duration-700">
    <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-16">
      <div className="flex items-center gap-12">
        <div className="p-12 bg-red-50 text-red-600 rounded-[50px] group-hover:bg-red-600 group-hover:text-white transition-all duration-700 shadow-xl group-hover:rotate-6 active:scale-90">
          <FileText className="w-18 h-18" />
        </div>
        <div className="flex flex-col">
          <span className="font-black text-3xl text-slate-950 line-clamp-1 tracking-tighter mb-3">{pdf.name}</span>
          <div className="flex items-center gap-6">
             <div className="flex items-center gap-3 px-6 py-2 bg-emerald-50 text-emerald-600 text-[11px] font-black uppercase tracking-[0.4em] rounded-full border border-emerald-100">
                <CheckCircle2 className="w-4 h-4" /> Disponible Cloud
             </div>
             <span className="text-[11px] text-slate-400 font-bold tracking-widest uppercase">{new Date(pdf.created_at).toLocaleDateString('fr-FR')}</span>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-6">
        <button onClick={onPreview} className="flex-1 xl:flex-none flex items-center justify-center gap-6 px-16 py-7 bg-slate-950 text-white font-black rounded-[35px] hover:bg-indigo-600 transition-all active:scale-95 shadow-3xl">
          <Eye className="w-8 h-8" /> <span className="uppercase tracking-[0.3em] text-[12px]">Aperçu</span>
        </button>
        <button onClick={() => { const a = document.createElement('a'); a.href = pdf.url; a.download = pdf.name; a.target = '_blank'; a.click(); }} className="p-7 bg-slate-50 text-slate-950 border border-slate-100 rounded-[35px] hover:bg-white hover:border-indigo-500 transition-all active:scale-95 shadow-xl">
          <Download className="w-9 h-9" />
        </button>
        {isAdmin && (
          <button onClick={onDelete} className="p-7 bg-red-50 text-red-500 border border-red-100 rounded-[35px] hover:bg-red-600 hover:text-white transition-all shadow-xl">
            <Trash2 className="w-9 h-9" />
          </button>
        )}
      </div>
    </div>
    <div className="mt-16 pt-16 border-t-2 border-slate-50/80 flex flex-col gap-10">
      <span className="text-[13px] font-black text-indigo-500 uppercase tracking-[0.8em] flex items-center gap-4">
        <Sparkles className="w-5 h-5" /> Consigne de Merlin
      </span>
      {isAdmin ? (
        <textarea 
          defaultValue={pdf.comment} onBlur={(e) => onUpdateComment(pdf.id, e.target.value)}
          placeholder="Ajouter une note ou une consigne pédagogique (corrigée par l'IA)..."
          className="w-full bg-slate-50 border-3 border-slate-100 p-12 rounded-[60px] text-2xl font-bold text-slate-700 focus:bg-white focus:border-indigo-600 outline-none transition-all resize-none h-56 shadow-inner"
        />
      ) : (
        <div className="relative">
          <p className="text-[22px] text-slate-800 font-bold leading-relaxed bg-gradient-to-br from-indigo-50/30 to-white p-16 rounded-[70px] border-2 border-indigo-50/40 italic shadow-3xl shadow-indigo-100/5">
            {pdf.comment || "Consultez ce document avec attention pour préparer vos examens."}
          </p>
        </div>
      )}
    </div>
  </div>
);

export default App;
