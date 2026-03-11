/**
 * 🚀 SERVEUR NODE.JS - MON SALON FIDÈLE
 *
 * Endpoints génériques pour sécuriser Airtable et Make
 */

const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());

// ===================== CORS =====================

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

app.options('*', cors(corsOptions));

// ===================== CONFIG =====================

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const AIRTABLE_BASE  = process.env.AIRTABLE_BASE;
const PORT           = process.env.PORT || 3000;

// ===================== /api/airtable/query =====================

/**
 * POST /api/airtable/query
 * Body: { table: "Salon", filterByFormula: "{Nom Du Salon} = \"xyz\"" }
 * Retour: { records: [...] }
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
      params: { filterByFormula },
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` }
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

// ===================== /api/airtable/create =====================

/**
 * POST /api/airtable/create
 * Body: { table: "Salon", fields: { ... } }
 * Retour: { id: "rec123...", fields: {...} }
 *
 * ➜ Applique la limite freemium : max 30 clients par salon si plan = "fremium"
 */
app.post('/api/airtable/create', async (req, res) => {
  try {
    const { table, fields } = req.body;

    if (!table || !fields) {
      return res.status(400).json({
        error: 'Paramètres manquants: table et fields requis'
      });
    }

    const CLIENTS_TABLE = 'Clients';          // nom exact de ta table Clients
    const SALON_TABLE   = 'Salon';           // nom de la table Salon
    const PLAN_FIELD    = 'plan';            // champ plan dans Salon
    const SALON_CODE_FIELD = 'Formule salon_id_string'; // champ code salon dans Salon
    const CLIENT_SALON_CODE_FIELD = 'Formule salon_id_string'; // même code côté Clients (lookup)

    // ---------- Limite freemium uniquement pour la table Clients ----------
    if (table === CLIENTS_TABLE) {
      // 1) Récupérer le code salon envoyé avec le client
      // On s'attend à ce que le front/envoi mette ce champ dans "fields"
      const salonCode = fields[SALON_CODE_FIELD];

      if (!salonCode) {
        // On ne bloque pas, mais on signale que le code manque
        console.warn('[MSF] Création client sans Formule salon_id_string, pas de limite appliquée.');
      } else {

        // 2) Retrouver le salon via Formule salon_id_string dans la table Salon
        const salonUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${encodeURIComponent(SALON_TABLE)}`;
        const salonFilter = `{${SALON_CODE_FIELD}} = "${salonCode}"`;

        const salonResp = await axios.get(salonUrl, {
          params: { filterByFormula: salonFilter },
          headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` }
        });

        const salonRecords = salonResp.data.records || [];

        if (!salonRecords.length) {
          console.warn('[MSF] Aucun salon trouvé pour code:', salonCode);
        } else {
          const salonRecord = salonRecords[0];
          const plan = salonRecord.fields[PLAN_FIELD] || 'fremium'; // valeurs: pro / fremium

          if (plan === 'fremium') {
            // 3) Compter les clients existants avec le même code salon
            const clientsUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${encodeURIComponent(CLIENTS_TABLE)}`;
            const clientsFilter = `{${CLIENT_SALON_CODE_FIELD}} = "${salonCode}"`;

            const clientsResp = await axios.get(clientsUrl, {
              params: {
                filterByFormula: clientsFilter,
                pageSize: 100
              },
              headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` }
            });

            const nbClients = (clientsResp.data.records || []).length;
            console.log(`[MSF] Freemium check pour salon ${salonCode}: ${nbClients} clients existants`);

            if (nbClients >= 30) {
              return res.status(403).json({
                error: 'PLAN_LIMIT',
                message: 'Limite du plan freemium atteinte (30 clients). Passez au plan Pro pour ajouter plus de clients.'
              });
            }
          }
        }
      }
    }

    // ---------- Si on n'a pas bloqué, on crée normalement le record ----------
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${encodeURIComponent(table)}`;

    const response = await axios.post(
      url,
      { records: [{ fields }] },
      { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
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

// ===================== /api/airtable/update =====================

/**
 * POST /api/airtable/update
 * Body: { table: "Salon", recordId: "rec123...", fields: {...} }
 * Retour: { id: "rec123...", fields: {...} }
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
      { fields },
      { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
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

// ===================== /api/webhook/proxy =====================

/**
 * POST /api/webhook/proxy
 * Body: { webhookName: "SERVICES", payload: {...} }
 * Retour: réponse Make telle quelle
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

// ===================== HEALTH CHECK =====================

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

// ===================== DÉMARRAGE =====================

app.listen(PORT, () => {
  console.log(`\n🚀 Serveur Mon Salon Fidèle lancé sur port ${PORT}`);
  console.log(`✅ Endpoints disponibles:`);
  console.log(`   - POST /api/airtable/query (filterByFormula)`);
  console.log(`   - POST /api/airtable/create`);
  console.log(`   - POST /api/airtable/update`);
  console.log(`   - POST /api/webhook/proxy`);
  console.log(`\n📋 Vérifiez le .env pour: AIRTABLE_TOKEN, AIRTABLE_BASE, MAKE_WEBHOOK_* \n`);
});

