/**
 * 🚀 SERVEUR NODE.JS - MON SALON FIDÈLE
 * 
 * 4 endpoints génériques pour sécuriser Airtable et Make
 * Token jamais exposé au frontend ✅
 */

const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());

// Configure CORS
const corsOptions = {
    origin: [
        'https://www.monsalonfidele.com',
        'http://localhost:3000',
        'http://localhost:8000'
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));

// ✅ FIX CORS: Middleware pour forcer les headers CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://www.monsalonfidele.com');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Handle preflight requests
app.options('*', cors(corsOptions));

// ============================================
// CONFIG (depuis .env)
// ============================================

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const AIRTABLE_BASE = process.env.AIRTABLE_BASE;
const PORT = process.env.PORT || 3000;

// ============================================
// ENDPOINT 1: Query générique (GET avec filterByFormula)
// ============================================

/**
 * POST /api/airtable/query
 * 
 * REÇOIT: { table: "Salon", filterByFormula: "{Nom Du Salon} = \"xyz\"" }
 * RETOURNE: { records: [...] }
 */

app.post('/api/airtable/query', async (req, res) => {
  try {
    const { table, filterByFormula } = req.body;

    if (!table || !filterByFormula) {
      return res.status(400).json({
        error: 'Paramètres manquants: table et filterByFormula requis'
      });
    }

    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${encodeURIComponent(table)}`;
    
    const response = await axios.get(url, {
      params: {
        filterByFormula: filterByFormula
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
 * REÇOIT: { table: "Salon", fields: { "Nom Du Salon": "Mon Salon" } }
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

    res.json(response.data.records[0]);
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
 * REÇOIT: { table: "Salon", recordId: "rec123...", fields: { "Nom Du Salon": "Nouveau Nom" } }
 * RETOURNE: { id: "rec123...", fields: {...} }
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

    res.json(response.data.records[0]);
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
// HEALTH CHECK
// ============================================

app.get('/', (req, res) => {
  res.json({
    status: '✅ Serveur Mon Salon Fidèle actif',
    endpoints: [
      'POST /api/airtable/query (filterByFormula)',
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
  console.log(`   - POST /api/airtable/query (filterByFormula)`);
  console.log(`   - POST /api/airtable/create`);
  console.log(`   - POST /api/airtable/update`);
  console.log(`   - POST /api/webhook/proxy`);
  console.log(`\n📋 Vérifiez le .env pour: AIRTABLE_TOKEN, AIRTABLE_BASE, MAKE_WEBHOOK_*\n`);
});
