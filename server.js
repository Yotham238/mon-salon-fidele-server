/**
 * 🚀 SERVEUR NODE.JS - MON SALON FIDÈLE
 * 
 * 4 endpoints génériques pour sécuriser Airtable et Make
 * Token jamais exposé au frontend ✅
 */

const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

// ============================================
// CONFIG (depuis .env)
// ============================================

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const AIRTABLE_BASE = process.env.AIRTABLE_BASE;
const PORT = process.env.PORT || 3000;

// ============================================
// ENDPOINT 1: Query générique (GET avec formule)
// ============================================

/**
 * POST /api/airtable/query
 * 
 * REÇOIT: { table: "Salon", formula: "{Formule salon_id_string}=\"xyz\"" }
 * RETOURNE: { records: [...], offset?: "..." }
 */

app.post('/api/airtable/query', async (req, res) => {
  try {
    const { table, formula } = req.body;

    if (!table || !formula) {
      return res.status(400).json({
        error: 'Paramètres manquants: table et formula requis'
      });
    }

    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${encodeURIComponent(table)}`;
    
    const response = await axios.get(url, {
      params: {
        filterByFormula: formula
      },
      headers: {
        Authorization: `Bearer ${AIRTABLE_TOKEN}`
      }
    });

    res.json(response.data);
  } catch (error) {
    console.error('Erreur query:', error.message);
    res.status(error.response?.status || 500).json({
      error: error.message,
      details: error.response?.data?.error?.message || ''
    });
  }
});

// ============================================
// ENDPOINT 2: Create (créer un record)
// ============================================

/**
 * POST /api/airtable/create
 * 
 * REÇOIT: { table: "clients", fields: { "e-mail": "test@test.com", "prenom": "Jean" } }
 * RETOURNE: { records: [{ id: "rec123...", fields: {...} }] }
 */

app.post('/api/airtable/create', async (req, res) => {
  try {
    const { table, fields } = req.body;

    if (!table || !fields) {
      return res.status(400).json({
        error: 'Paramètres manquants: table et fields requis'
      });
    }

    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${encodeURIComponent(table)}`;

    const response = await axios.post(
      url,
      {
        records: [
          {
            fields: fields
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${AIRTABLE_TOKEN}`
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error('Erreur create:', error.message);
    res.status(error.response?.status || 500).json({
      error: error.message,
      details: error.response?.data?.error?.message || ''
    });
  }
});

// ============================================
// ENDPOINT 3: Update (modifier un record)
// ============================================

/**
 * POST /api/airtable/update
 * 
 * REÇOIT: { table: "clients", recordId: "rec123...", fields: { "prenom": "Jean Updated" } }
 * RETOURNE: { records: [{ id: "rec123...", fields: {...} }] }
 */

app.post('/api/airtable/update', async (req, res) => {
  try {
    const { table, recordId, fields } = req.body;

    if (!table || !recordId || !fields) {
      return res.status(400).json({
        error: 'Paramètres manquants: table, recordId et fields requis'
      });
    }

    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${encodeURIComponent(table)}/${recordId}`;

    const response = await axios.patch(
      url,
      {
        fields: fields
      },
      {
        headers: {
          Authorization: `Bearer ${AIRTABLE_TOKEN}`
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error('Erreur update:', error.message);
    res.status(error.response?.status || 500).json({
      error: error.message,
      details: error.response?.data?.error?.message || ''
    });
  }
});

// ============================================
// ENDPOINT 4: Webhook Proxy (appeler Make)
// ============================================

/**
 * POST /api/webhook/proxy
 * 
 * REÇOIT: { webhookName: "SERVICES", payload: {...} }
 * RETOURNE: La réponse de Make telle quelle
 */

app.post('/api/webhook/proxy', async (req, res) => {
  try {
    const { webhookName, payload } = req.body;

    if (!webhookName || !payload) {
      return res.status(400).json({
        error: 'Paramètres manquants: webhookName et payload requis'
      });
    }

    const envKey = `MAKE_WEBHOOK_${webhookName.toUpperCase()}`;
    const webhookUrl = process.env[envKey];

    if (!webhookUrl) {
      return res.status(400).json({
        error: `Webhook non trouvé: ${envKey}. Vérifiez les variables d'env.`
      });
    }

    const response = await axios.post(webhookUrl, payload);

    res.json(response.data);
  } catch (error) {
    console.error('Erreur webhook:', error.message);
    res.status(error.response?.status || 500).json({
      error: error.message,
      details: error.response?.data || ''
    });
  }
});

// ============================================
// HEALTH CHECK (optionnel, utile pour Render)
// ============================================

app.get('/', (req, res) => {
  res.json({
    status: '✅ Serveur Mon Salon Fidèle actif',
    endpoints: [
      'POST /api/airtable/query',
      'POST /api/airtable/create',
      'POST /api/airtable/update',
      'POST /api/webhook/proxy'
    ]
  });
});

// ============================================
// DÉMARRAGE
// ============================================

app.listen(PORT, () => {
  console.log(`\n🚀 Serveur Mon Salon Fidèle lancé sur port ${PORT}`);
  console.log(`✅ Endpoints disponibles:`);
  console.log(`   - POST /api/airtable/query`);
  console.log(`   - POST /api/airtable/create`);
  console.log(`   - POST /api/airtable/update`);
  console.log(`   - POST /api/webhook/proxy`);
  console.log(`\n📋 Vérifiez le .env pour: AIRTABLE_TOKEN, AIRTABLE_BASE, MAKE_WEBHOOK_*\n`);
});

module.exports = app;
