import { GoogleGenAI } from "@google/genai";
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const GEMINI_API_KEY = process.env.API_KEY || process.env.GEMINI_API_KEY || '';

console.log("🛠️ Debug Env Keys:", Object.keys(process.env).filter(k => k.includes('URL') || k.includes('KEY') || k.includes('API')));

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Variables Supabase manquantes (SUPABASE_URL, SUPABASE_ANON_KEY)");
  process.exit(1);
}

if (!GEMINI_API_KEY) {
  console.warn("⚠️ API_KEY manquante. Le renommage intelligent sera désactivé.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

async function addPdf(filePath: string, categoryPath: string) {
  try {
    const fileName = path.basename(filePath);
    const fileBuffer = fs.readFileSync(filePath);
    const base64Data = fileBuffer.toString('base64');

    console.log(`🔍 Analyse de l'épreuve : ${fileName}...`);

    // 1. Analyse par Gemini pour le renommage et les métadonnées
    let finalName = fileName;
    let finalCategory = categoryPath;

    if (GEMINI_API_KEY) {
      const analysisPrompt = `Tu es un expert en éducation au Cameroun. Analyse ce PDF d'épreuve scolaire.
      1. Génère un nom de fichier court et descriptif (ex: Bac_Maths_C_2026_Centre).
      2. Identifie la catégorie exacte dans l'app (Exemple: Coin du Bac > 2026 > Série D > SVT > Examen Blanc).
      Réponds UNIQUEMENT au format JSON: {"newName": "nom_du_fichier", "category": "Chemin > Complet > Categorie"}`;

      const response = await genAI.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: "application/pdf"
              }
            },
            { text: analysisPrompt }
          ]
        }
      });

      const resultText = response.text;
      const analysis = JSON.parse(resultText || '{}');
      finalName = analysis.newName.replace('.pdf', '') + '.pdf';
      if (!finalCategory) finalCategory = analysis.category;
    } else {
      console.warn("⚠️ Utilisation du nom de fichier original car API_KEY est manquante.");
      if (!finalCategory) finalCategory = "Non classé";
    }

    console.log(`✨ Analyse terminée :`);
    console.log(`   - Nouveau nom : ${finalName}`);
    console.log(`   - Catégorie : ${finalCategory}`);

    // 2. Upload vers Supabase Storage
    const sanitizedName = finalName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9.-]/g, "_");
    const storagePath = `${Date.now()}_${sanitizedName}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('pdf-library')
      .upload(storagePath, fileBuffer, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('pdf-library')
      .getPublicUrl(storagePath);

    // 3. Insertion dans la base de données
    const { error: dbError } = await supabase
      .from('pdfs')
      .insert([{
        name: finalName,
        url: publicUrl,
        category: finalCategory,
        comment: "Ajouté automatiquement par l'Assistant Gemini."
      }]);

    if (dbError) throw dbError;

    console.log(`✅ Succès ! L'épreuve est maintenant en ligne dans "${finalCategory}".`);
    
  } catch (error) {
    console.error("❌ Erreur lors de l'ajout :", error);
  }
}

// Récupération des arguments
const filePath = process.argv[2];
const category = process.argv[3] || "";

if (!filePath) {
  console.log("Usage: tsx scripts/add-pdf.ts <chemin_du_fichier> [categorie]");
} else {
  addPdf(filePath, category);
}
