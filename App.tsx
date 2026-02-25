import React, { useState, useEffect, useMemo } from 'react';
import { 
  Menu, X, BookOpen, Plus, Trash2, Eye, Download, Star, GraduationCap, 
  FileText, Calendar, ChevronRight, School, Library, Compass, Award, 
  Globe, Sparkles, Cloud, RefreshCw, Search, Zap, CheckCircle2, AlertTriangle, ArrowLeft,
  Trophy, User, Mail, Lock, Flag, Clock, Camera, Send
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { createClient } from '@supabase/supabase-js';
import { 
  Level, Serie, Sequence, PdfDocument, NavigationState, 
  ChallengeUser, Challenge,
  SUBJECTS_CD, SUBJECTS_A4, SUBJECTS_3EME, SEQUENCES 
} from './types';

// On récupère les variables injectées par vite.config.ts
// Nettoyage des variables d'environnement (retrait des guillemets ou espaces accidentels)
const cleanEnv = (val: string | undefined) => (val || '').replace(/['"]/g, '').trim();

const SUPABASE_URL = cleanEnv(process.env.SUPABASE_URL);
const SUPABASE_KEY = cleanEnv(process.env.SUPABASE_ANON_KEY);

// Initialisation sécurisée de Supabase
let supabase: any = null;
try {
  if (SUPABASE_URL && SUPABASE_URL.startsWith('http') && SUPABASE_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log("✅ Supabase initialisé avec succès");
  } else {
    console.warn("⚠️ Supabase n'est pas configuré ou l'URL est invalide");
  }
} catch (e) {
  console.error("❌ Erreur critique lors de l'initialisation de Supabase:", e);
}

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
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [isBanned, setIsBanned] = useState(localStorage.getItem('edulib_banned') === 'true');
  const [challengeUser, setChallengeUser] = useState<ChallengeUser | null>(null);
  const [adminMode, setAdminMode] = useState<'library' | 'challenges'>('library');

  // Scroll to top on navigation
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [nav]);

  const testSupabase = async () => {
    if (!supabase) {
      const missing = [];
      if (!SUPABASE_URL) missing.push("SUPABASE_URL");
      if (!SUPABASE_KEY) missing.push("SUPABASE_ANON_KEY");
      alert(`❌ Supabase n'est pas initialisé. Variables manquantes : ${missing.join(', ')}. Ajoutez-les dans les Secrets.`);
      return;
    }
    
    setIsSyncing(true);
    try {
      // Test 1: Table PDFS
      const { error: tableError } = await supabase.from('pdfs').select('count').limit(1);
      if (tableError) throw new Error(`Table 'pdfs' inaccessible : ${tableError.message}`);
      
      // Test 2: Storage
      const { data: buckets, error: storageError } = await supabase.storage.listBuckets();
      
      if (storageError) {
        console.warn("Impossible de lister les buckets (RLS), tentative d'accès direct...");
      }
      
      const hasBucket = buckets?.find((b: any) => b.name === 'pdf-library');
      if (buckets && !hasBucket) {
        throw new Error("Le bucket 'pdf-library' n'existe pas. Créez-le dans l'onglet Storage de Supabase et mettez-le en PUBLIC.");
      }

      alert("✅ Diagnostic terminé. Si l'envoi échoue encore, lancez le script SQL des POLICIES dans votre SQL Editor Supabase.");
    } catch (err: any) {
      alert(`🚨 DIAGNOSTIC : ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // Vérification de la clé API pour Gemini
  const apiKey = process.env.API_KEY;
  const ai = useMemo(() => {
    if (!apiKey) return null;
    return new GoogleGenAI({ apiKey });
  }, [apiKey]);

  // Synchronisation avec Supabase
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

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (isBanned) {
      alert("🚫 Cet appareil est banni pour tentatives d'intrusion répétées.");
      return;
    }

    if (adminPassword === 'merlin2025') {
      setIsAdmin(true);
      setShowAdminLogin(false);
      setAdminPassword('');
      setFailedAttempts(0);
    } else {
      const newAttempts = failedAttempts + 1;
      setFailedAttempts(newAttempts);
      
      if (newAttempts >= 3) {
        setIsBanned(true);
        localStorage.setItem('edulib_banned', 'true');
        alert("🚨 ACCÈS BLOQUÉ : Vous avez été banni de l'application.");
        setShowAdminLogin(false);
      } else {
        alert(`❌ Code erroné. Il vous reste ${3 - newAttempts} tentative(s).`);
      }
    }
  };

  const currentPath = [nav.level, nav.year, nav.serie, nav.subject, nav.sequence].filter(Boolean).join(' > ');

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!supabase) {
      alert("❌ Erreur : Supabase n'est pas configuré. Vérifiez vos variables d'environnement SUPABASE_URL et SUPABASE_ANON_KEY dans les Secrets.");
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
      const publicUrl = urlData.publicUrl;
      
      const correctedName = await handleAiCorrection(file.name.replace('.pdf', ''));

      if (adminMode === 'challenges') {
        const newChallenge = {
          subject: nav.subject || 'MATHEMATIQUES',
          level: nav.level || 'Terminale',
          serie: nav.serie || null,
          pdf_url: publicUrl,
          date: new Date().toISOString().split('T')[0]
        };
        const { error: challengeError } = await supabase.from('challenges').insert([newChallenge]);
        if (challengeError) throw new Error(`Erreur Table Challenges : ${challengeError.message}`);
        alert("🚀 Défi programmé pour ce soir !");
      } else {
        const newPdf = {
          name: correctedName + '.pdf',
          url: publicUrl,
          comment: '',
          category: currentPath
        };
        const { error: insertError } = await supabase.from('pdfs').insert([newPdf]);
        if (insertError) throw new Error(`Erreur Table PDFs : ${insertError.message}`);
        alert("✅ Document ajouté à la bibliothèque !");
      }
    } catch (err: any) {
      alert(err.message);
      console.error(err);
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

  if (isBanned) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-center">
        <div className="max-w-xl space-y-12">
          <div className="w-32 h-32 bg-red-600 rounded-[40px] flex items-center justify-center mx-auto shadow-2xl shadow-red-500/50 animate-pulse">
            <AlertTriangle className="w-16 h-16 text-white" />
          </div>
          <div className="space-y-6">
            <h1 className="text-5xl font-black text-white tracking-tighter uppercase">Accès Révoqué</h1>
            <p className="text-slate-400 font-bold text-xl leading-relaxed italic">
              "Cet appareil a été banni suite à plusieurs tentatives d'intrusion non autorisées. Contactez l'administrateur Merlin pour plus d'informations."
            </p>
          </div>
          <div className="pt-12 border-t border-white/10">
            <p className="text-[10px] font-black text-slate-600 uppercase tracking-[1em]">EduLib Security System</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen transition-all duration-1000 ease-in-out font-sans text-slate-900" style={{ backgroundColor: bgColor }}>
      
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

        <button 
          onClick={() => isAdmin ? setIsAdmin(false) : setShowAdminLogin(true)} 
          className={`px-4 sm:px-8 py-3 sm:py-4 rounded-xl sm:rounded-[22px] text-[8px] sm:text-[10px] font-black uppercase tracking-widest transition-all ${isAdmin ? 'bg-red-600 text-white shadow-lg animate-pulse' : 'bg-slate-950 text-white hover:bg-indigo-600 shadow-lg'}`}
          title={isAdmin ? "Mode Admin Actif" : "Se connecter en tant qu'administrateur"}
        >
          {isAdmin ? (
            <>
              <span className="sm:hidden">Admin On</span>
              <span className="hidden sm:inline">Merlin Actif (Quitter)</span>
            </>
          ) : 'Accès Merlin'}
        </button>
      </header>

      {/* Menu Latéral */}
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
                <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-[0.5em] mb-8">Navigation</h4>
                <div className="grid grid-cols-1 gap-4">
                  <button 
                    onClick={() => { setNav({ mode: 'library' }); setIsMenuOpen(false); }}
                    className={`p-6 rounded-[30px] border-4 flex items-center gap-6 transition-all ${nav.mode !== 'challenge' ? 'border-indigo-600 bg-indigo-50/50' : 'border-slate-50'}`}
                  >
                    <Library className="w-8 h-8 text-indigo-600" />
                    <span className="text-sm font-black text-slate-900 uppercase tracking-widest">Bibliothèque</span>
                  </button>
                  <button 
                    onClick={() => { setNav({ mode: 'challenge' }); setIsMenuOpen(false); }}
                    className={`p-6 rounded-[30px] border-4 flex items-center gap-6 transition-all ${nav.mode === 'challenge' ? 'border-red-600 bg-red-50/50' : 'border-slate-50'}`}
                  >
                    <Zap className="w-8 h-8 text-red-600" />
                    <span className="text-sm font-black text-slate-900 uppercase tracking-widest">Défis du Soir</span>
                  </button>
                </div>
              </section>

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


              <section className="p-10 bg-gradient-to-br from-indigo-600 to-purple-700 text-white rounded-[40px] shadow-2xl group cursor-pointer" onClick={() => window.open('https://play.google.com', '_blank')}>
                <Star className="w-12 h-12 mb-4 text-white/40" />
                <h5 className="font-black text-sm uppercase tracking-[0.3em] mb-2">Notez l'application</h5>
                <p className="text-[11px] opacity-70 leading-relaxed uppercase">Aidez-nous à grandir sur le Store !</p>
              </section>

              <section className="mt-8">
                <AdBanner type="sidebar" />
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
        {nav.mode === 'challenge' ? (
          <ChallengeSection challengeUser={challengeUser} setChallengeUser={setChallengeUser} ai={ai} onBack={resetNav} />
        ) : (
          <>
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
            <button 
              onClick={() => setNav({ mode: 'challenge' })}
              className="col-span-1 sm:col-span-2 lg:col-span-3 p-8 sm:p-12 bg-gradient-to-r from-red-600 to-orange-500 rounded-[40px] sm:rounded-[60px] text-white flex items-center justify-between group hover:scale-[1.02] transition-all shadow-2xl shadow-red-200 overflow-hidden relative"
            >
              <div className="absolute top-0 right-0 p-12 opacity-10 rotate-12">
                <Trophy className="w-48 h-48" />
              </div>
              <div className="flex items-center gap-6 sm:gap-10 relative z-10">
                <div className="p-5 sm:p-8 bg-white/20 rounded-[25px] sm:rounded-[35px] backdrop-blur-md">
                  <Trophy className="w-10 h-10 sm:w-16 h-16 text-white" />
                </div>
                <div className="text-left">
                  <h3 className="text-2xl sm:text-5xl font-black uppercase tracking-tighter">Défis du Soir</h3>
                  <p className="text-white/80 font-black uppercase tracking-[0.3em] text-[8px] sm:text-[12px] mt-2">Compétition académique en direct à 21h</p>
                </div>
              </div>
              <div className="p-4 sm:p-6 bg-white text-red-600 rounded-full group-hover:translate-x-4 transition-transform relative z-10">
                <ChevronRight className="w-6 h-6 sm:w-10 h-10" />
              </div>
            </button>

            {(['3e', 'Seconde', 'Première', 'Terminale', 'Coin du Bac', 'Coin Externe'] as Level[]).map((l) => {
              const s = getStyleForLevel(l);
              return <NavCard key={l} title={l} icon={s.icon} colorClass={s.color} onClick={() => setNav({ level: l })} />;
            })}
            {isAdmin && (
              <div className="col-span-1 sm:col-span-2 lg:col-span-3 p-8 bg-indigo-50 border-2 border-dashed border-indigo-200 rounded-[40px] text-center">
                <p className="text-indigo-600 font-black uppercase tracking-widest text-[10px]">💡 Mode Merlin Actif : Naviguez dans une classe et une matière pour ajouter des documents.</p>
              </div>
            )}
            <div className="hidden sm:block">
              <AdBanner type="grid" />
            </div>
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
                <div className="flex flex-col gap-4">
                  <div className="flex bg-slate-100 p-2 rounded-[25px] border-2 border-slate-200">
                    <button 
                      onClick={() => setAdminMode('library')}
                      className={`flex-1 px-6 py-3 rounded-[20px] text-[9px] font-black uppercase tracking-widest transition-all ${adminMode === 'library' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}
                    >
                      Bibliothèque
                    </button>
                    <button 
                      onClick={() => setAdminMode('challenges')}
                      className={`flex-1 px-6 py-3 rounded-[20px] text-[9px] font-black uppercase tracking-widest transition-all ${adminMode === 'challenges' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-400'}`}
                    >
                      Défis du Soir
                    </button>
                  </div>
                  <div className="flex gap-4">
                    <button 
                      onClick={testSupabase}
                      className="p-7 bg-slate-100 text-slate-400 rounded-[40px] hover:bg-indigo-50 hover:text-indigo-600 transition-all"
                      title="Diagnostiquer Supabase"
                    >
                      <AlertTriangle className="w-8 h-8" />
                    </button>
                    <label className={`flex-1 flex items-center gap-6 px-12 py-7 rounded-[40px] font-black cursor-pointer transition-all shadow-3xl active:scale-95 group ${isUploading ? 'bg-slate-400' : adminMode === 'challenges' ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-slate-950 text-white hover:bg-indigo-600'}`}>
                      {isUploading ? <RefreshCw className="w-10 h-10 animate-spin" /> : <Plus className="w-10 h-10" />}
                      <span className="uppercase tracking-[0.3em] text-[11px]">{isUploading ? 'Envoi...' : adminMode === 'challenges' ? 'Programmer le Défi' : 'Ajouter Document'}</span>
                      <input type="file" accept="application/pdf" className="hidden" onChange={handleFileUpload} />
                    </label>
                  </div>
                </div>
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
      </>
    )}
  </main>

      {/* Login Admin */}
      {showAdminLogin && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-3xl animate-in fade-in">
          <div className="w-full max-w-xl bg-white rounded-[60px] p-16 shadow-3xl">
            <h3 className="text-4xl font-black text-slate-950 tracking-tighter text-center mb-12 uppercase">Accès Merlin</h3>
            <form onSubmit={handleAdminLogin} className="space-y-8">
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

      {/* Aperçu PDF */}
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
          </div>
        </div>
      )}

      {/* Footer Signature */}
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
        <a 
          href={pdf.url} 
          download={pdf.name} 
          target="_blank" 
          rel="noopener noreferrer"
          className="flex items-center justify-center p-4 sm:p-6 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-2xl sm:rounded-[30px] hover:bg-emerald-600 hover:text-white transition-all shadow-lg"
          title="Télécharger"
        >
          <Download className="w-6 h-6 sm:w-8 h-8" />
        </a>
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
      <div className={`w-full ${type === 'grid' ? 'h-full min-h-[250px]' : 'aspect-square'} bg-slate-50/50 rounded-[40px] border border-slate-100 flex flex-col items-center justify-center p-6 text-center overflow-hidden relative group transition-all hover:bg-white hover:shadow-xl hover:shadow-indigo-500/5`}>
        <ins className="adsbygoogle"
             style={{ display: 'block' }}
             data-ad-client="ca-pub-YOUR_CLIENT_ID"
             data-ad-slot="YOUR_AD_SLOT_ID"
             data-ad-format="auto"
             data-full-width-responsive="true"></ins>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none opacity-20 group-hover:opacity-40 transition-opacity">
          <Zap className="w-6 h-6 text-slate-400 mb-2" />
          <span className="text-[7px] font-black text-slate-400 uppercase tracking-[0.4em]">Sponsorisé</span>
        </div>
        <div className="absolute top-4 right-6">
          <span className="text-[6px] font-black text-slate-300 uppercase tracking-widest">Annonce</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-[100px] bg-white/50 rounded-[40px] border border-slate-100 shadow-sm flex items-center justify-center p-4 overflow-hidden relative group hover:bg-white transition-all">
      <ins className="adsbygoogle"
           style={{ display: 'block' }}
           data-ad-client="ca-pub-YOUR_CLIENT_ID"
           data-ad-slot="YOUR_AD_SLOT_ID"
           data-ad-format="horizontal"
           data-full-width-responsive="true"></ins>
      <div className="absolute top-2 right-6">
        <span className="text-[6px] font-black text-slate-300 uppercase tracking-widest">Partenaire EduLib</span>
      </div>
    </div>
  );
};

const ChallengeSection: React.FC<{ challengeUser: ChallengeUser | null, setChallengeUser: (u: ChallengeUser | null) => void, ai: any, onBack: () => void }> = ({ challengeUser, setChallengeUser, ai, onBack }) => {
  const [step, setStep] = useState<'auth' | 'class' | 'serie' | 'subject' | 'waiting' | 'active' | 'submitting' | 'result'>('auth');
  const [level, setLevel] = useState<Level | null>(null);
  const [serie, setSerie] = useState<Serie | null>(null);
  const [subject, setSubject] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [isJoined, setIsJoined] = useState(false);
  const [submissionPhotos, setSubmissionPhotos] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [gradingResult, setGradingResult] = useState<{ score: number, feedback: string } | null>(null);
  const [leaderboard, setLeaderboard] = useState<ChallengeUser[]>([]);
  const [currentChallenge, setCurrentChallenge] = useState<any>(null);
  const [pastChallenges, setPastChallenges] = useState<any[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState<'ESPAGNOL' | 'ALLEMAND' | null>(null);

  // Auth states
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ username: '', email: '', password: '', country: '🇨🇲' });
  const [isLoading, setIsLoading] = useState(false);

  // Vérifier la session au chargement
  useEffect(() => {
    if (!supabase) return;
    
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: profile } = await supabase
          .from('challenge_users')
          .select('*')
          .eq('id', session.user.id)
          .single();
        
        if (profile) {
          setChallengeUser(profile);
          setStep('class');
        }
      }
    };
    checkSession();
    fetchLeaderboard();
    fetchPastChallenges();

    // Real-time leaderboard
    const channel = supabase.channel('leaderboard_updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'challenge_users' }, fetchLeaderboard)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchLeaderboard = async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from('challenge_users')
      .select('*')
      .order('points', { ascending: false })
      .limit(10);
    if (data) setLeaderboard(data);
  };

  const fetchPastChallenges = async () => {
    if (!supabase) return;
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('challenges')
      .select('*')
      .lt('date', today)
      .order('date', { ascending: false });
    if (data) setPastChallenges(data);
  };

  const fetchChallenge = async (l: Level, s: Serie | null, lang?: string) => {
    if (!supabase) return;
    const today = new Date().toISOString().split('T')[0];
    let subj = getDaySubject(l, s);
    
    if (subj?.includes('/') && lang) {
      subj = lang;
    }

    const { data, error } = await supabase
      .from('challenges')
      .select('*')
      .eq('level', l)
      .eq('date', today)
      .eq('subject', subj)
      .maybeSingle();
    
    if (data) {
      setCurrentChallenge(data);
      setSubject(data.subject);
    } else {
      setSubject(subj);
    }
  };

  const getDaySubject = (l: Level, s: Serie | null) => {
    const day = new Date().getDay(); // 0 = Sunday, 1 = Monday...
    if (l === 'Terminale' || l === 'Première') {
      if (s === 'C') {
        const schedule = ['MATHEMATIQUES', 'MATHEMATIQUES', 'PHYSIQUE', 'CHIMIE', 'MATHEMATIQUES', 'PHYSIQUE', 'CHIMIE'];
        return schedule[day];
      }
      if (s === 'D') {
        const schedule = ['SVT', 'SVT', 'MATHEMATIQUES', 'PHYSIQUE', 'CHIMIE', 'SVT', 'MATHEMATIQUES'];
        return schedule[day];
      }
      if (s === 'A4') {
        const schedule = ['ESPAGNOL/ALLEMAND', 'PHILOSOPHIE', 'LITTERATURE', 'ANGLAIS', 'LANGUE', 'MATHEMATIQUES', 'PHILOSOPHIE'];
        return schedule[day];
      }
    }
    if (l === 'Seconde') {
      if (s === 'C') {
        const schedule = ['MATHEMATIQUES', 'MATHEMATIQUES', 'PHYSIQUE', 'CHIMIE', 'MATHEMATIQUES', 'PHYSIQUE', 'CHIMIE'];
        return schedule[day];
      }
      if (s === 'A4') {
        const schedule = ['ESPAGNOL/ALLEMAND', 'PHILOSOPHIE', 'LITTERATURE', 'ANGLAIS', 'LANGUE', 'MATHEMATIQUES', 'PHILOSOPHIE'];
        return schedule[day];
      }
    }
    if (l === '3e') {
      const schedule = ['ALLEMAND/ESPAGNOL', 'MATHEMATIQUES', 'PCT', 'ALLEMAND/ESPAGNOL', 'ANGLAIS', 'MATHEMATIQUES', 'PCT'];
      return schedule[day];
    }
    return null;
  };

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const target = new Date();
      target.setHours(21, 0, 0, 0);
      
      if (now >= target) {
        setTimeLeft('00:00:00');
      } else {
        const diff = target.getTime() - now.getTime();
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        setTimeLeft(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      const missing = [];
      if (!SUPABASE_URL) missing.push("SUPABASE_URL");
      if (!SUPABASE_KEY) missing.push("SUPABASE_ANON_KEY");
      alert(`Supabase n'est pas configuré. Variables manquantes : ${missing.join(', ')}. Ajoutez-les dans les Secrets de l'application.`);
      return;
    }

    setIsLoading(true);
    try {
      console.log("Tentative d'authentification...", isLogin ? "Connexion" : "Inscription");
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password,
        });
        if (error) throw error;

        console.log("Auth réussie, récupération du profil...");
        const { data: profile, error: profileError } = await supabase
          .from('challenge_users')
          .select('*')
          .eq('id', data.user.id)
          .single();
        
        if (profile) {
          setChallengeUser(profile);
          setStep('class');
        } else {
          console.log("Profil manquant, création automatique...");
          // Si le profil manque (ex: erreur lors de l'inscription précédente)
          const newUser = {
            id: data.user.id,
            username: formData.username || data.user.email?.split('@')[0] || 'User',
            email: data.user.email || formData.email,
            country: formData.country,
            points: 0
          };
          const { error: insertError } = await supabase.from('challenge_users').insert([newUser]);
          if (insertError) throw new Error("Profil manquant et impossible de le créer. Contactez l'administrateur.");
          
          setChallengeUser(newUser);
          setStep('class');
        }
      } else {
        // Vérifier si le pseudo existe déjà
        const { data: existing } = await supabase
          .from('challenge_users')
          .select('username')
          .eq('username', formData.username)
          .maybeSingle();
        
        if (existing) {
          alert("Ce nom d'utilisateur est déjà pris. Veuillez en choisir un autre.");
          setIsLoading(false);
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
        });
        
        if (error) {
          if (error.message.includes("already registered")) {
            throw new Error("Cet email est déjà utilisé. Essayez de vous connecter.");
          }
          throw error;
        }

        if (data.user) {
          console.log("Utilisateur créé dans Auth, insertion du profil...");
          const newUser = {
            id: data.user.id,
            username: formData.username,
            email: formData.email,
            country: formData.country,
            points: 0
          };
          
          const { error: insertError } = await supabase
            .from('challenge_users')
            .insert([newUser]);
          
          if (insertError) {
            console.error("Erreur insertion profil:", insertError);
            throw new Error(`Compte créé mais erreur de profil : ${insertError.message}. Cela arrive si les règles RLS sont mal configurées.`);
          }
          
          console.log("Profil créé avec succès !");
          setChallengeUser(newUser);
          setStep('class');
          alert("🎉 Inscription réussie ! Bienvenue dans les Défis EduLib.");
        } else {
          console.log("Pas d'utilisateur retourné (Email confirmation ?)");
          alert("📧 Un email de confirmation vous a été envoyé. Veuillez cliquer sur le lien dans l'email pour activer votre compte. Si vous avez désactivé la confirmation dans Supabase, réessayez de vous connecter.");
        }
      }
    } catch (err: any) {
      console.error("Erreur handleAuth:", err);
      alert(`🚨 ERREUR : ${err.message || "Une erreur inconnue est survenue"}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut();
    setChallengeUser(null);
    setStep('auth');
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSubmissionPhotos(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGrade = async () => {
    if (!ai || submissionPhotos.length === 0 || !supabase || !challengeUser) return;
    setIsSubmitting(true);
    try {
      // 1. Upload des photos vers Supabase Storage
      const uploadedUrls = [];
      for (const photo of submissionPhotos) {
        const fileName = `submissions/${challengeUser.id}/${Date.now()}_${Math.random().toString(36).substr(2, 5)}.jpg`;
        // Conversion base64 en Blob pour l'upload
        const res = await fetch(photo);
        const blob = await res.blob();
        
        const { error: uploadError } = await supabase.storage
          .from('challenge-submissions')
          .upload(fileName, blob);
        
        if (!uploadError) {
          const { data: { publicUrl } } = supabase.storage
            .from('challenge-submissions')
            .getPublicUrl(fileName);
          uploadedUrls.push(publicUrl);
        }
      }

      // 2. Correction par IA
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          { text: `Tu es un correcteur scolaire expert au Cameroun. Analyse ce travail d'élève pour l'épreuve de ${subject}. Attribue une note sur 20 et donne un feedback constructif détaillé. Réponds UNIQUEMENT au format JSON: {"score": 15, "feedback": "Ton raisonnement est bon mais attention aux unités..."}` },
          ...submissionPhotos.map(p => ({
            inlineData: {
              mimeType: "image/jpeg",
              data: p.split(',')[1]
            }
          }))
        ],
      });
      
      const result = JSON.parse(response.text || '{"score": 10, "feedback": "Correction effectuée."}');
      setGradingResult(result);

      // 3. Enregistrer la soumission
      await supabase.from('submissions').insert([{
        user_id: challengeUser.id,
        challenge_id: currentChallenge?.id || 'daily',
        photo_urls: uploadedUrls,
        score: result.score,
        feedback: result.feedback,
        subject: subject,
        level: level
      }]);

      // 4. Mettre à jour les points de l'utilisateur
      const newPoints = challengeUser.points + result.score;
      await supabase
        .from('challenge_users')
        .update({ points: newPoints })
        .eq('id', challengeUser.id);
      
      setChallengeUser({ ...challengeUser, points: newPoints });
      setStep('result');
      fetchLeaderboard();
    } catch (e) {
      console.error(e);
      alert("Erreur lors de la correction ou de l'enregistrement.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!challengeUser) {
    return (
      <div className="max-w-xl mx-auto bg-white rounded-[60px] p-12 sm:p-16 shadow-3xl animate-in fade-in zoom-in duration-500 relative">
        <button 
          onClick={onBack}
          className="absolute top-8 left-8 p-4 bg-slate-50 text-slate-400 rounded-2xl hover:bg-red-50 hover:text-red-600 transition-all"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div className="text-center mb-12">
          <div className="w-24 h-24 bg-red-600 rounded-[35px] flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-red-200">
            <Trophy className="w-12 h-12 text-white" />
          </div>
          <h2 className="text-4xl font-black text-slate-950 tracking-tighter uppercase">Défis du Soir</h2>
          <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mt-4">Rejoignez l'élite scolaire</p>
        </div>

        <form onSubmit={handleAuth} className="space-y-6">
          {!isLogin && (
            <div className="relative">
              <User className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
              <input 
                type="text" placeholder="Nom d'utilisateur..." required
                value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})}
                className="w-full pl-16 pr-8 py-6 bg-slate-50 border-2 border-slate-100 rounded-[30px] font-bold focus:border-red-600 outline-none transition-all"
              />
            </div>
          )}
          <div className="relative">
            <Mail className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
            <input 
              type="email" placeholder="Adresse Email..." required
              value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})}
              className="w-full pl-16 pr-8 py-6 bg-slate-50 border-2 border-slate-100 rounded-[30px] font-bold focus:border-red-600 outline-none transition-all"
            />
          </div>
          <div className="relative">
            <Lock className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
            <input 
              type="password" placeholder="Mot de passe..." required
              value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})}
              className="w-full pl-16 pr-8 py-6 bg-slate-50 border-2 border-slate-100 rounded-[30px] font-bold focus:border-red-600 outline-none transition-all"
            />
          </div>
          {!isLogin && (
            <div className="relative">
              <Flag className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
              <select 
                value={formData.country} onChange={e => setFormData({...formData, country: e.target.value})}
                className="w-full pl-16 pr-8 py-6 bg-slate-50 border-2 border-slate-100 rounded-[30px] font-bold focus:border-red-600 outline-none transition-all appearance-none"
              >
                <option value="🇨🇲">Cameroun 🇨🇲</option>
                <option value="🇬🇦">Gabon 🇬🇦</option>
                <option value="🇨🇬">Congo 🇨🇬</option>
                <option value="🇨🇮">Côte d'Ivoire 🇨🇮</option>
              </select>
            </div>
          )}

          <button type="submit" disabled={isLoading} className="w-full py-8 bg-slate-950 text-white font-black rounded-[35px] uppercase tracking-widest hover:bg-red-600 transition-all shadow-2xl active:scale-95 disabled:bg-slate-400">
            {isLoading ? 'Chargement...' : (isLogin ? 'Se Connecter' : "S'inscrire")}
          </button>
        </form>

        <button onClick={() => setIsLogin(!isLogin)} className="w-full mt-8 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-red-600 transition-colors">
          {isLogin ? "Pas de compte ? S'inscrire" : "Déjà inscrit ? Se connecter"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-12 animate-in fade-in duration-700">
      <div className="flex items-center justify-between bg-white p-8 rounded-[40px] shadow-xl border-2 border-slate-50">
        <div className="flex items-center gap-6">
          <button 
            onClick={onBack}
            className="p-4 bg-slate-50 text-slate-400 rounded-2xl hover:bg-red-50 hover:text-red-600 transition-all mr-2"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="w-16 h-16 bg-red-600 rounded-2xl flex items-center justify-center text-white text-2xl">
            {challengeUser.country}
          </div>
          <div>
            <h3 className="text-2xl font-black text-slate-950 tracking-tighter uppercase">{challengeUser.username}</h3>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{challengeUser.points} Points</span>
          </div>
        </div>
        <button onClick={handleLogout} className="p-4 bg-slate-50 rounded-2xl hover:bg-red-50 hover:text-red-600 transition-all">
          <X className="w-6 h-6" />
        </button>
      </div>

      {step === 'class' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
          {(['3e', 'Seconde', 'Première', 'Terminale'] as Level[]).map(l => (
            <button key={l} onClick={() => { setLevel(l); fetchChallenge(l, null); setStep(l === '3e' ? 'waiting' : 'serie'); }} className="p-12 bg-white rounded-[50px] border-4 border-slate-50 hover:border-red-600 transition-all text-center group">
              <School className="w-16 h-16 mx-auto mb-6 text-slate-200 group-hover:text-red-600 transition-colors" />
              <span className="text-3xl font-black text-slate-950 uppercase tracking-tighter">{l}</span>
            </button>
          ))}
        </div>
      )}

      {step === 'serie' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          {(['C', 'D', 'A4'] as Serie[]).map(s => (
            <button key={s} onClick={() => { setSerie(s); fetchChallenge(level!, s); setStep('waiting'); }} className="p-12 bg-white rounded-[50px] border-4 border-slate-50 hover:border-red-600 transition-all text-center group">
              <Award className="w-16 h-16 mx-auto mb-6 text-slate-200 group-hover:text-red-600 transition-colors" />
              <span className="text-3xl font-black text-slate-950 uppercase tracking-tighter">Série {s}</span>
            </button>
          ))}
        </div>
      )}

      {step === 'waiting' && (
        <div className="max-w-3xl mx-auto text-center space-y-12 py-20">
          <div className="inline-flex items-center gap-4 px-8 py-4 bg-red-50 text-red-600 rounded-full text-[12px] font-black uppercase tracking-[0.4em]">
            <Clock className="w-5 h-5" /> Prochain Défi
          </div>
          
          <div className="space-y-4">
            <h2 className="text-7xl sm:text-9xl font-black text-slate-950 tracking-tighter">{timeLeft}</h2>
            <p className="text-slate-400 font-bold uppercase tracking-[0.6em] text-sm">Avant le lancement de l'épreuve</p>
          </div>

          <div className="p-12 bg-white rounded-[60px] shadow-2xl border-2 border-slate-50">
            <h4 className="text-sm font-black text-slate-300 uppercase tracking-[0.4em] mb-6">Matière du jour</h4>
            <div className="flex flex-col items-center gap-6">
              <span className="text-4xl font-black text-red-600 uppercase tracking-tighter">
                {getDaySubject(level!, serie) || "Chargement..."}
              </span>
              
              {getDaySubject(level!, serie)?.includes('/') && !selectedLanguage && (
                <div className="flex gap-4 mt-4">
                  <button 
                    onClick={() => { setSelectedLanguage('ESPAGNOL'); fetchChallenge(level!, serie, 'ESPAGNOL'); }}
                    className={`px-8 py-4 rounded-2xl font-black uppercase tracking-widest transition-all ${selectedLanguage === 'ESPAGNOL' ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                  >
                    Espagnol
                  </button>
                  <button 
                    onClick={() => { setSelectedLanguage('ALLEMAND'); fetchChallenge(level!, serie, 'ALLEMAND'); }}
                    className={`px-8 py-4 rounded-2xl font-black uppercase tracking-widest transition-all ${selectedLanguage === 'ALLEMAND' ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                  >
                    Allemand
                  </button>
                </div>
              )}
            </div>
          </div>

          {timeLeft === '00:00:00' && (getDaySubject(level!, serie)?.includes('/') ? selectedLanguage : true) && (
            <button onClick={() => setStep('active')} className="px-16 py-8 bg-red-600 text-white font-black rounded-[40px] text-2xl uppercase tracking-widest shadow-2xl shadow-red-200 animate-bounce">
              Rejoindre le Défi
            </button>
          )}
        </div>
      )}

      {step === 'active' && (
        <div className="space-y-12">
          <div className="flex items-center justify-between">
            <h2 className="text-4xl font-black text-slate-950 tracking-tighter uppercase">Épreuve en cours</h2>
            <div className="px-6 py-3 bg-red-600 text-white rounded-full font-black text-xl">
              60:00
            </div>
          </div>
          
          <div className="aspect-[3/4] bg-white rounded-[60px] shadow-3xl overflow-hidden border-4 border-slate-950">
            <iframe src={currentChallenge?.pdf_url ? `${currentChallenge.pdf_url}#toolbar=0` : "https://example.com/demo.pdf#toolbar=0"} className="w-full h-full border-none" />
          </div>

          <div className="p-12 bg-slate-950 rounded-[60px] text-white space-y-8">
            <h3 className="text-2xl font-black uppercase tracking-tighter">Soumettre votre travail</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
              {submissionPhotos.map((p, i) => (
                <div key={i} className="aspect-square rounded-3xl overflow-hidden border-2 border-white/20">
                  <img src={p} className="w-full h-full object-cover" />
                </div>
              ))}
              <label className="aspect-square rounded-3xl border-4 border-dashed border-white/20 flex flex-col items-center justify-center cursor-pointer hover:bg-white/5 transition-all">
                <Camera className="w-10 h-10 mb-2 opacity-40" />
                <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Photo</span>
                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
              </label>
            </div>
            
            {submissionPhotos.length > 0 && (
              <button 
                onClick={handleGrade} disabled={isSubmitting}
                className="w-full py-8 bg-red-600 text-white font-black rounded-[35px] uppercase tracking-widest hover:bg-white hover:text-red-600 transition-all shadow-2xl"
              >
                {isSubmitting ? 'Correction IA en cours...' : 'Envoyer pour Correction'}
              </button>
            )}
          </div>
        </div>
      )}

      {step === 'result' && gradingResult && (
        <div className="max-w-3xl mx-auto space-y-12 text-center animate-in zoom-in duration-700">
          <div className="w-40 h-40 bg-emerald-500 rounded-[50px] flex items-center justify-center mx-auto shadow-2xl shadow-emerald-200">
            <span className="text-6xl font-black text-white">{gradingResult.score}/20</span>
          </div>
          <div className="space-y-6">
            <h2 className="text-5xl font-black text-slate-950 tracking-tighter uppercase">Bravo {challengeUser.username} !</h2>
            <p className="text-xl text-slate-600 font-bold italic leading-relaxed">"{gradingResult.feedback}"</p>
          </div>
          
          <div className="p-12 bg-white rounded-[60px] shadow-xl border-2 border-slate-50 text-left">
            <h4 className="text-sm font-black text-slate-300 uppercase tracking-[0.4em] mb-8">Classement Global</h4>
            <div className="space-y-6">
              {leaderboard.length > 0 ? leaderboard.map((item, idx) => (
                <div key={item.id} className={`flex items-center justify-between p-6 rounded-3xl ${item.id === challengeUser.id ? 'bg-indigo-50 border-2 border-indigo-100' : 'bg-slate-50'}`}>
                  <div className="flex items-center gap-6">
                    <span className="text-2xl font-black text-slate-300">#{idx + 1}</span>
                    <span className="text-2xl">{item.country}</span>
                    <span className="text-xl font-black text-slate-950 uppercase">{item.username}</span>
                  </div>
                  <span className="text-xl font-black text-indigo-600">{item.points} pts</span>
                </div>
              )) : (
                <p className="text-center text-slate-400 font-bold uppercase tracking-widest text-xs py-8">Chargement du classement...</p>
              )}
            </div>
          </div>

          <button onClick={() => setStep('class')} className="text-sm font-black text-slate-400 uppercase tracking-widest hover:text-red-600 transition-colors">
            Retour à l'accueil
          </button>
        </div>
      )}

      {/* Section Archives des Défis */}
      {step === 'class' && pastChallenges.length > 0 && (
        <div className="mt-20">
          <h4 className="text-sm font-black text-slate-300 uppercase tracking-[0.4em] mb-10 flex items-center gap-4">
            <Calendar className="w-5 h-5" /> Archives des Défis
          </h4>
          <div className="grid grid-cols-1 gap-6">
            {pastChallenges.map((c) => (
              <div key={c.id} className="bg-white p-8 rounded-[40px] border-2 border-slate-50 flex items-center justify-between group hover:border-red-100 transition-all">
                <div className="flex items-center gap-6">
                  <div className="p-4 bg-slate-50 text-slate-400 rounded-2xl group-hover:bg-red-50 group-hover:text-red-600 transition-all">
                    <FileText className="w-8 h-8" />
                  </div>
                  <div>
                    <h5 className="text-xl font-black text-slate-950 uppercase tracking-tighter">{c.subject}</h5>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      {c.level} {c.serie ? `• Série ${c.serie}` : ''} • {new Date(c.date).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => window.open(c.pdf_url, '_blank')}
                  className="px-8 py-4 bg-slate-950 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl hover:bg-red-600 transition-all"
                >
                  Consulter
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;