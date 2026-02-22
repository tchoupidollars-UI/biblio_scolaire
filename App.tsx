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
        const { data, error } = await supabase
          .from('pdfs')
          .select('*')
          .order('created_at', { ascending: false });
        if (!error && data) {
          setPdfs(data);
        }
      } catch (e) {
        console.error("Erreur Supabase:", e);
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
        contents: `Tu es un correcteur orthographique pour une application scolaire camerounaise. Corrige l'orthographe de ce titre ou commentaire : "${text}". Réponds UNIQUEMENT avec le texte corrigé.`,
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
    if (!supabase) return;
    const file = e.target.files?.[0];
    if (!file) return;

    if (nav.level === 'Coin du Bac') {
      const existingInPath = pdfs.filter(p => p.category === currentPath).length;
      if (existingInPath >= 2) {
        alert("🔒 Limite atteinte : 2 documents max pour le Coin du Bac.");
        return;
      }
    }

    setIsUploading(true);
    try {
      const fileName = `${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage.from('pdf-library').upload(fileName, file);
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

      await supabase.from('pdfs').insert([newPdf]);
    } catch (err: any) {
      alert("Erreur : " + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (id: string, url: string) => {
    if (!supabase || !confirm("Supprimer ce document ?")) return;
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
    if (!supabase) return;
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
    <div className="min-h-screen transition-all duration-1000 ease-in-out font-sans text-slate-900" style={{ backgroundColor: bgColor }}>
      
      {(!apiKey || !SUPABASE_URL) && (
        <div className="fixed top-0 left-0 right-0 bg-red-600 text-white text-[10px] font-black uppercase tracking-widest py-3 px-6 z-[300] flex flex-col items-center justify-center gap-1 shadow-2xl">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> 
            ALERTE CONFIGURATION VERCEL
          </div>
          <p className="opacity-80">Vérifie les variables d'environnement (Settings &gt; Environment Variables)</p>
        </div>
      )}

      {(isSyncing || isUploading) && (
        <div className="fixed top-0 left-0 right-0 h-1.5 z-[200]">
          <div className="h-full bg-gradient-to-r from-indigo-600 via-purple-500 to-pink-500 animate-gradient-x w-full" />
        </div>
      )}

      <header className="fixed top-0 left-0 right-0 h-20 sm:h-28 bg-white/70 backdrop-blur-3xl border-b border-slate-200/40 z-[90] flex items-center justify-between px-4 sm:px-16">
        <div className="flex items-center gap-4 sm:gap-8">
          <button onClick={() => setIsMenuOpen(true)} className="p-3 sm:p-5 bg-slate-950 text-white rounded-2xl sm:rounded-[28px] hover:scale-110 active:scale-95 transition-all shadow-xl">
            <Menu className="w-6 h-6 sm:w-8 h-8" />
          </button>
          <div className="flex flex-col cursor-pointer" onClick={resetNav}>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-4xl font-black tracking-tighter text-slate-950">EduLib</h1>
              <div className="px-1.5 py-0.5 bg-indigo-600 text-[7px] sm:text-[8px] font-black text-white rounded uppercase animate-pulse">Cloud</div>
            </div>
            <span className="text-[7px] sm:text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] sm:tracking-[0.4em] leading-none mt-1">NNOMO ZOGO MERLIN</span>
          </div>
        </div>

        <div className="hidden lg:flex flex-1 max-w-xl mx-16 relative">
          <Search className="absolute left-7 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
          <input 
            type="text" placeholder="Rechercher une épreuve..."
            value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-16 pr-8 py-5 bg-slate-50 border-2 border-slate-100 rounded-[30px] text-sm font-bold focus:bg-white focus:border-indigo-600 outline-none transition-all"
          />
        </div>

        <button onClick={() => isAdmin ? setIsAdmin(false) : setShowAdminLogin(true)} className={`px-4 sm:px-8 py-3 sm:py-4 rounded-xl sm:rounded-[22px] text-[8px] sm:text-[10px] font-black uppercase tracking-widest transition-all ${isAdmin ? 'bg-red-600 text-white shadow-lg' : 'bg-slate-950 text-white hover:bg-indigo-600 shadow-lg'}`}>
          {isAdmin ? (
            <>
              <span className="sm:hidden">Off</span>
              <span className="hidden sm:inline">Quitter Merlin</span>
            </>
          ) : 'Admin'}
        </button>
      </header>

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

              <section>
                <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-[0.5em] mb-8">Partenaire</h4>
                <AdBanner type="sidebar" />
              </section>

              <section className="p-10 bg-gradient-to-br from-indigo-600 to-purple-700 text-white rounded-[40px] shadow-2xl group cursor-pointer" onClick={() => window.open('https://play.google.com', '_blank')}>
                <Star className="w-12 h-12 mb-4 text-white/40" />
                <h5 className="font-black text-sm uppercase tracking-[0.3em] mb-2">Notez l'application</h5>
                <p className="text-[11px] opacity-70 leading-relaxed uppercase">Aidez-nous à grandir sur le Store !</p>
              </section>
            </div>

            <div className="pt-12 border-t border-slate-100 mt-auto text-center">
              <p className="text-[10px] text-slate-300 font-black uppercase tracking-[0.6em] mb-5">Application créée par</p>
              <p className="text-slate-950 font-black text-xl tracking-tighter uppercase">NNOMO ZOGO MERLIN RAYAN</p>
            </div>
          </div>
        </div>
      </div>

      <main className="pt-32 sm:pt-40 pb-56 px-4 sm:px-16 max-w-7xl mx-auto">
        <div className="mb-12 sm:mb-20">
          {!searchQuery && (
            <>
              <div className="flex items-center gap-3 sm:gap-5 text-[9px] sm:text-[11px] font-black text-slate-400 overflow-x-auto no-scrollbar py-2">
                <button onClick={resetNav} className="hover:text-indigo-600 transition-colors uppercase tracking-[0.2em] sm:tracking-[0.4em] bg-white px-4 sm:px-8 py-2 sm:py-3 rounded-xl sm:rounded-[18px] shadow-sm border border-slate-50 whitespace-nowrap">Bibliothèque</button>
                {nav.level && <><ChevronRight className="w-3 h-3 sm:w-4 h-4" /><span className="text-indigo-600 uppercase tracking-[0.2em] sm:tracking-[0.4em] whitespace-nowrap">{nav.level}</span></>}
                {nav.year && <><ChevronRight className="w-3 h-3 sm:w-4 h-4" /><span className="text-red-600 uppercase tracking-[0.2em] sm:tracking-[0.4em] whitespace-nowrap">{nav.year}</span></>}
                {nav.serie && <><ChevronRight className="w-3 h-3 sm:w-4 h-4" /><span className="text-purple-600 uppercase tracking-[0.2em] sm:tracking-[0.4em] whitespace-nowrap">Série {nav.serie}</span></>}
                {nav.subject && <><ChevronRight className="w-3 h-3 sm:w-4 h-4" /><span className="text-emerald-600 uppercase tracking-[0.2em] sm:tracking-[0.4em] whitespace-nowrap">{nav.subject}</span></>}
              </div>
              
              {nav.level && (
                <button 
                  onClick={handleGoBack}
                  className="mt-6 flex items-center gap-3 px-6 py-3 bg-slate-950 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 transition-all active:scale-95 shadow-lg"
                >
                  <ArrowLeft className="w-4 h-4" /> Retour
                </button>
              )}

              <div className="mt-8">
                <AdBanner type="horizontal" />
              </div>
            </>
          )}
        </div>

        {searchQuery ? (
          <div className="space-y-12 animate-in fade-in duration-700">
            <h2 className="text-5xl font-black tracking-tighter text-slate-950">Exploration <span className="text-indigo-600">Cloud</span></h2>
            <div className="grid grid-cols-1 gap-10">
              {filteredPdfs.map(pdf => <PdfCard key={pdf.id} pdf={pdf} isAdmin={isAdmin} onDelete={() => handleDelete(pdf.id, pdf.url)} onPreview={() => setPreviewPdf(pdf)} onUpdateComment={handleUpdateComment} />)}
            </div>
          </div>
        ) : !nav.level ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-10">
            {(['3e', 'Seconde', 'Première', 'Terminale', 'Coin du Bac', 'Coin Externe'] as Level[]).map((l) => {
              const s = getStyleForLevel(l);
              return <NavCard key={l} title={l} icon={s.icon} colorClass={s.color} onClick={() => setNav({ level: l })} />;
            })}
            <AdBanner type="grid" />
          </div>
        ) : nav.level === 'Coin du Bac' && !nav.year ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            {Array.from({ length: 2025 - 2018 + 1 }, (_, i) => (2025 - i).toString()).map(y => (
              <NavCard key={y} title={y} icon={<Calendar />} colorClass="bg-red-600" onClick={() => setNav(p => ({ ...p, year: y }))} />
            ))}
          </div>
        ) : nav.level === 'Coin du Bac' && nav.year && !nav.serie ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {(['C', 'D', 'A4'] as Serie[]).map(s => (
              <NavCard key={s} title={`Série ${s}`} icon={<Award />} colorClass="bg-purple-600" onClick={() => setNav(p => ({ ...p, serie: s }))} />
            ))}
          </div>
        ) : nav.level === 'Terminale' && !nav.serie ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {(['C', 'D', 'A4'] as Serie[]).map(s => (
              <NavCard key={s} title={`Série ${s}`} icon={<Award />} colorClass="bg-purple-600" onClick={() => setNav(p => ({ ...p, serie: s }))} />
            ))}
          </div>
        ) : (nav.level === 'Première' || nav.level === 'Seconde') && !nav.serie ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {(nav.level === 'Seconde' ? ['C', 'A4'] as Serie[] : ['C', 'D', 'A4'] as Serie[]).map(s => (
              <NavCard key={s} title={`Série ${s}`} icon={<Award />} colorClass="bg-purple-600" onClick={() => setNav(p => ({ ...p, serie: s }))} />
            ))}
          </div>
        ) : nav.level && nav.level !== 'Coin Externe' && (nav.level === '3e' || nav.serie) && !nav.subject ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {(nav.level === '3e' ? SUBJECTS_3EME : nav.serie === 'A4' ? SUBJECTS_A4 : SUBJECTS_CD).map(subj => (
              <NavCard key={subj} title={subj} icon={<Sparkles />} colorClass="bg-emerald-600" onClick={() => setNav(p => ({ ...p, subject: subj }))} />
            ))}
          </div>
        ) : nav.level && nav.level !== 'Coin Externe' && nav.subject && !nav.sequence && nav.level !== 'Coin du Bac' ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            {SEQUENCES.filter(s => nav.level === 'Seconde' ? s !== 'Epreuve Zéro' : true).map(seq => (
              <NavCard key={seq} title={seq} icon={<Zap />} colorClass="bg-blue-600" onClick={() => setNav(p => ({ ...p, sequence: seq as Sequence }))} />
            ))}
          </div>
        ) : (
          <div className="space-y-16 animate-in fade-in duration-1000">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-12 border-b border-slate-200/40 pb-16">
              <div className="flex flex-col">
                <h3 className="text-6xl font-black text-slate-950 tracking-tighter uppercase mb-6">
                  {nav.sequence || nav.subject || nav.year || nav.level}
                </h3>
                <div className="px-6 py-3 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-black uppercase tracking-[0.4em] inline-flex items-center gap-3 w-fit">
                  <Cloud className="w-4 h-4" /> Merlin Cloud Live
                </div>
              </div>
              {isAdmin && (
                <label className={`flex items-center gap-6 px-12 py-7 rounded-[40px] font-black cursor-pointer transition-all shadow-3xl active:scale-95 group ${isUploading ? 'bg-slate-400' : 'bg-slate-950 text-white hover:bg-indigo-600'}`}>
                  {isUploading ? <RefreshCw className="w-10 h-10 animate-spin" /> : <Plus className="w-10 h-10" />}
                  <span className="uppercase tracking-[0.3em] text-[11px]">{isUploading ? 'Envoi...' : 'Ajouter Document'}</span>
                  <input type="file" accept="application/pdf" className="hidden" onChange={handleFileUpload} />
                </label>
              )}
            </div>

            <div className="grid grid-cols-1 gap-12">
              {filteredPdfs.length === 0 ? (
                <div className="py-56 flex flex-col items-center justify-center bg-slate-50 rounded-[80px] border-4 border-dashed border-slate-200">
                  <BookOpen className="w-20 h-20 mb-8 opacity-10" />
                  <p className="font-black uppercase tracking-[0.6em] text-xs text-slate-400">Aucun document dans cette rubrique</p>
                </div>
              ) : (
                <>
                  {filteredPdfs.map(pdf => <PdfCard key={pdf.id} pdf={pdf} isAdmin={isAdmin} onDelete={() => handleDelete(pdf.id, pdf.url)} onPreview={() => setPreviewPdf(pdf)} onUpdateComment={handleUpdateComment} />)}
                  <div className="mt-12">
                    <AdBanner type="horizontal" />
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>

      {showAdminLogin && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-3xl animate-in fade-in">
          <div className="w-full max-w-xl bg-white rounded-[60px] p-16 shadow-3xl">
            <h3 className="text-4xl font-black text-slate-950 tracking-tighter text-center mb-12 uppercase">Accès Merlin</h3>
            <form onSubmit={(e) => { e.preventDefault(); if (adminPassword === 'merlin2025') { setIsAdmin(true); setShowAdminLogin(false); setAdminPassword(''); } else { alert("Code erroné."); } }} className="space-y-8">
              <input 
                type="password" placeholder="Mot de passe secret..." value={adminPassword} 
                onChange={(e) => setAdminPassword(e.target.value)} autoFocus
                className="w-full px-8 py-8 bg-slate-50 border-3 border-slate-100 rounded-[35px] font-black text-2xl text-center focus:border-indigo-600 outline-none"
              />
              <div className="flex gap-4">
                <button type="button" onClick={() => setShowAdminLogin(false)} className="flex-1 py-6 bg-slate-100 text-slate-500 font-black rounded-[30px] uppercase text-[10px] tracking-widest">Annuler</button>
                <button type="submit" className="flex-[2] py-6 bg-slate-950 text-white font-black rounded-[30px] uppercase text-[10px] tracking-widest">Entrer</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {previewPdf && (
        <div className="fixed inset-0 z-[400] flex flex-col bg-slate-950 p-4 sm:p-12 animate-in slide-in-from-bottom-20 duration-500">
          <div className="flex items-center justify-between p-10 bg-white/5 border border-white/10 rounded-t-[50px] text-white">
            <div className="flex items-center gap-8">
              <div className="p-6 bg-red-600 rounded-[30px]"><FileText className="w-10 h-10" /></div>
              <span className="text-2xl font-black tracking-tight line-clamp-1">{previewPdf.name}</span>
            </div>
            <button onClick={() => setPreviewPdf(null)} className="p-6 bg-white/10 hover:bg-red-600 text-white rounded-[30px] transition-all"><X className="w-10 h-10" /></button>
          </div>
          <div className="flex-1 bg-white rounded-b-[50px] overflow-hidden flex flex-col">
            <div className="flex-1">
              <iframe src={`${previewPdf.url}#toolbar=0`} className="w-full h-full border-none" title="Aperçu" />
            </div>
            <div className="bg-slate-50 p-4 border-t border-slate-100">
              <AdBanner type="horizontal" />
            </div>
          </div>
        </div>
      )}

      <footer className="fixed bottom-0 left-0 right-0 h-14 bg-white/20 backdrop-blur-xl border-t border-slate-100/20 z-[70] flex items-center justify-center pointer-events-none">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-[1.5em] opacity-30">NNOMO ZOGO MERLIN RAYAN</span>
      </footer>
    </div>
  );
};

const NavCard: React.FC<{ title: string, icon: any, colorClass: string, onClick: () => void }> = ({ title, icon, colorClass, onClick }) => (
  <button onClick={onClick} className="group flex flex-col items-start p-8 sm:p-14 bg-white border-2 border-slate-50 rounded-[40px] sm:rounded-[70px] text-left hover:shadow-2xl hover:-translate-y-4 transition-all duration-500 relative overflow-hidden active:scale-95">
    <div className={`p-6 sm:p-10 ${colorClass} text-white rounded-3xl sm:rounded-[40px] shadow-lg mb-8 sm:mb-12 transition-transform duration-500 group-hover:scale-110`}>
      {React.cloneElement(icon as React.ReactElement<any>, { className: 'w-8 h-8 sm:w-12 h-12' })}
    </div>
    <h2 className="text-2xl sm:text-4xl font-black text-slate-950 tracking-tighter mb-2 sm:mb-4 uppercase">{title}</h2>
    <div className="flex items-center gap-4">
      <div className={`h-1.5 sm:h-2 ${colorClass} rounded-full w-8 sm:w-10 group-hover:w-24 transition-all duration-700`} />
      <span className="text-[8px] sm:text-[10px] font-black text-slate-300 uppercase tracking-widest">Ouvrir</span>
    </div>
  </button>
);

const PdfCard: React.FC<{ pdf: PdfDocument, isAdmin: boolean, onDelete: () => void, onPreview: () => void, onUpdateComment: (id: string, c: string) => void }> = ({ pdf, isAdmin, onDelete, onPreview, onUpdateComment }) => (
  <div className="group bg-white rounded-[40px] sm:rounded-[60px] p-6 sm:p-12 shadow-xl shadow-slate-100/40 border-2 border-slate-50 hover:border-indigo-100 transition-all duration-500">
    <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-8 sm:gap-12">
      <div className="flex items-center gap-6 sm:gap-10">
        <div className="p-6 sm:p-10 bg-red-50 text-red-600 rounded-3xl sm:rounded-[40px] group-hover:bg-red-600 group-hover:text-white transition-all duration-500 shadow-md">
          <FileText className="w-8 h-8 sm:w-14 h-14" />
        </div>
        <div className="flex flex-col">
          <span className="font-black text-lg sm:text-2xl text-slate-950 line-clamp-1 tracking-tighter mb-1 sm:mb-2 uppercase">{pdf.name}</span>
          <div className="flex items-center gap-3 sm:gap-4">
             <div className="px-3 sm:px-5 py-1 bg-emerald-50 text-emerald-600 text-[8px] sm:text-[10px] font-black uppercase tracking-[0.2em] sm:tracking-[0.3em] rounded-full border border-emerald-100">Prêt</div>
             <span className="text-[8px] sm:text-[10px] text-slate-400 font-bold tracking-widest uppercase">{new Date(pdf.created_at).toLocaleDateString('fr-FR')}</span>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:gap-4">
        <button onClick={onPreview} className="flex-1 flex items-center justify-center gap-3 sm:gap-4 px-6 sm:px-12 py-4 sm:py-6 bg-slate-950 text-white font-black rounded-2xl sm:rounded-[30px] hover:bg-indigo-600 transition-all active:scale-95 shadow-lg">
          <Eye className="w-5 h-5 sm:w-6 h-6" /> <span className="uppercase tracking-[0.1em] sm:tracking-[0.2em] text-[9px] sm:text-[11px]">Aperçu</span>
        </button>
        <button onClick={() => window.open(pdf.url, '_blank')} className="p-4 sm:p-6 bg-slate-50 text-slate-950 border border-slate-100 rounded-2xl sm:rounded-[30px] hover:bg-white transition-all">
          <Download className="w-6 h-6 sm:w-8 h-8" />
        </button>
        {isAdmin && (
          <button onClick={onDelete} className="p-4 sm:p-6 bg-red-50 text-red-500 border border-red-100 rounded-2xl sm:rounded-[30px] hover:bg-red-600 hover:text-white transition-all">
            <Trash2 className="w-6 h-6 sm:w-8 h-8" />
          </button>
        )}
      </div>
    </div>
    <div className="mt-8 sm:mt-12 pt-8 sm:pt-12 border-t-2 border-slate-50 flex flex-col gap-4 sm:gap-6">
      <span className="text-[9px] sm:text-[11px] font-black text-indigo-500 uppercase tracking-[0.4em] sm:tracking-[0.6em] flex items-center gap-3">
        <Sparkles className="w-3 h-3 sm:w-4 h-4" /> Note de Merlin
      </span>
      {isAdmin ? (
        <textarea 
          defaultValue={pdf.comment} onBlur={(e) => onUpdateComment(pdf.id, e.target.value)}
          placeholder="Ajoutez votre note pédagogique ici..."
          className="w-full bg-slate-50 border-3 border-slate-100 p-6 sm:p-8 rounded-3xl sm:rounded-[40px] text-lg sm:text-xl font-bold text-slate-700 outline-none transition-all h-32 sm:h-40"
        />
      ) : (
        <p className="text-sm sm:text-[18px] text-slate-800 font-bold leading-relaxed bg-slate-50/50 p-6 sm:p-10 rounded-3xl sm:rounded-[45px] border-2 border-indigo-50/30 italic">
          {pdf.comment || "Consultez ce document pour vos révisions."}
        </p>
      )}
    </div>
  </div>
);

const AdBanner: React.FC<{ type: 'horizontal' | 'sidebar' | 'grid' }> = ({ type }) => {
  useEffect(() => {
    try {
      // @ts-ignore
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {}
  }, []);

  if (type === 'sidebar' || type === 'grid') {
    return (
      <div className={`w-full ${type === 'grid' ? 'h-full min-h-[300px]' : 'aspect-square'} bg-slate-50 rounded-[40px] border-2 border-dashed border-slate-200 flex flex-col items-center justify-center p-8 text-center overflow-hidden relative`}>
        <ins className="adsbygoogle"
             style={{ display: 'block' }}
             data-ad-client="ca-pub-YOUR_CLIENT_ID"
             data-ad-slot="YOUR_AD_SLOT_ID"
             data-ad-format="auto"
             data-full-width-responsive="true"></ins>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <Zap className="w-8 h-8 text-slate-200 mb-2" />
          <span className="text-[8px] font-black text-slate-300 uppercase tracking-[0.4em]">Espace Publicitaire</span>
        </div>
        <div className="absolute top-4 right-6">
          <span className="text-[7px] font-black text-slate-200 uppercase tracking-widest">Sponsorisé</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-[120px] bg-white rounded-[50px] border-2 border-slate-50 shadow-sm flex items-center justify-center p-6 overflow-hidden relative">
      <ins className="adsbygoogle"
           style={{ display: 'block' }}
           data-ad-client="ca-pub-YOUR_CLIENT_ID"
           data-ad-slot="YOUR_AD_SLOT_ID"
           data-ad-format="horizontal"
           data-full-width-responsive="true"></ins>
      <div className="absolute top-2 right-6">
        <span className="text-[7px] font-black text-slate-200 uppercase tracking-widest">Sponsorisé</span>
      </div>
    </div>
  );
};

export default App;