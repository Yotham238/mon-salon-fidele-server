/**
 * 🚀 SERVEUR NODE.JS - MON SALON FIDÈLE
 *
 * Endpoints génériques pour sécuriser Airtable et Make
 * + logique freemium basée sur nb_clients (rollup dans Salon)
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

// Middleware CORS explicite (au cas où)
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

if (!AIRTABLE_TOKEN || !AIRTABLE_BASE) {
  console.error('[MSF][boot] AIRTABLE_TOKEN ou AIRTABLE_BASE manquant dans .env');
}

// ===================== HELPERS LOG =====================

function logInfo(scope, message, extra = {}) {
  console.log(
    JSON.stringify({
      level: 'info',
      scope,
      message,
      ...extra,
      timestamp: new Date().toISOString()
    })
  );
}

function logError(scope, message, error, extra = {}) {
  console.error(
    JSON.stringify({
      level: 'error',
      scope,
      message,
      error: error?.message || error,
      stack: error?.stack,
      ...extra,
      timestamp: new Date().toISOString()
    })
  );
}

// ===================== /api/airtable/query =====================

/**
 * POST /api/airtable/query
 * Body: { table: "Salon", filterByFormula: "{Nom Du Salon} = \"xyz\"" }
 * Retour: payload brut Airtable (records, etc.)
 */
app.post('/api/airtable/query', async (req, res) => {
  try {
    const { table, filterByFormula } = req.body;

    if (!table || !filterByFormula) {
      return res.status(400).json({
        error: 'Paramètres manquants: table et filterByFormula requis'
      });
    }

    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${encodeURIComponent(
      table
    )}`;

    logInfo('airtableQuery', 'Incoming query', { table, filterByFormula });

    const response = await axios.get(url, {
      params: { filterByFormula },
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` }
    });

    logInfo('airtableQuery', 'Query success', {
      table,
      count: (response.data.records || []).length
    });

    res.json(response.data);
  } catch (error) {
    logError('airtableQuery', 'Query failed', error, {
      status: error.response?.status
    });
    res.status(error.response?.status || 500).json({
      error: error.message,
      details: error.response?.data?.error?.message || ''
    });
  }
});

// ===================== /api/airtable/create =====================

/**
 * POST /api/airtable/create
 * Body: { table: "Salon" | "clients" | ..., fields: { ... } }
 *
 * ➜ Applique la limite freemium : max 30 clients par salon si plan = "fremium"
 *    en utilisant le champ rollup "nb_clients" dans la table Salon.
 */
app.post('/api/airtable/create', async (req, res) => {
  const scope = 'airtableCreate';

  try {
    const { table, fields } = req.body;

    if (!table || !fields) {
      return res.status(400).json({
        error: 'Paramètres manquants: table et fields requis'
      });
    }

    // Log de base
    logInfo(scope, 'Incoming create', {
      table,
      fieldKeys: Object.keys(fields)
    });

    // === Config logique freemium ===
    const CLIENTS_TABLE            = 'clients'; // nom EXACT de ta table Airtable
    const SALON_TABLE              = 'Salon';
    const PLAN_FIELD               = 'plan';    // "fremium" | "pro"
    const SALON_CODE_FIELD_SALON   = 'Formule salon_id_string'; // côté Salon (formule)
    const CLIENTS_COUNT_FIELD      = 'nb_clients'; // rollup dans Salon
    const FREEMIUM_MAX_CLIENTS     = 30;
   // Champs possibles pour récupérer le code salon côté client
   const SALON_CODE_FIELD_CLIENT_1 = 'Formule salon_id_string (à partir de Salon associés)';
   const SALON_CODE_FIELD_CLIENT_2 = 'Formule salon_id_string';
   const SALON_CODE_FIELD_CLIENT_3 = 'salon_id_string';        // au cas où tu l’utilises un jour
   const SALON_CODE_FIELD_CLIENT_4 = 'salon_id';               // idem
    const SALON_CODE_FIELD_CLIENT_5 = 'salon_id_string_text';   // 👈 ton champ texte existant


    // ---------- Limite freemium uniquement pour la table clients ----------
    if (table.toLowerCase() === CLIENTS_TABLE.toLowerCase()) {
      logInfo(scope, 'Processing freemium logic for clients');

      // 1) Récupérer le code salon depuis les fields
      const salonCode =
        fields[SALON_CODE_FIELD_CLIENT_1] ||
        fields[SALON_CODE_FIELD_CLIENT_2] ||
        fields[SALON_CODE_FIELD_CLIENT_3] ||
        fields[SALON_CODE_FIELD_CLIENT_4] ||
        fields[SALON_CODE_FIELD_CLIENT_5];

      logInfo(scope, 'Salon code extracted from fields', { salonCode });

      if (!salonCode) {
        // On considère que c'est une erreur fonctionnelle : pas de client sans salon
        return res.status(400).json({
          error: 'MISSING_SALON_CODE',
          message:
            'Impossible de créer un client sans identifiant de salon (salon_id_string).'
        });
      }

      // 2) Retrouver le salon via Formule salon_id_string dans la table Salon
      const salonUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${encodeURIComponent(
        SALON_TABLE
      )}`;
      const salonFilter = `{${SALON_CODE_FIELD_SALON}} = "${salonCode}"`;

      logInfo(scope, 'Fetching salon for freemium check', {
        salonFilter
      });

      const salonResp = await axios.get(salonUrl, {
        params: { filterByFormula: salonFilter },
        headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` }
      });

      const salonRecords = salonResp.data.records || [];

      logInfo(scope, 'Salon records found', { count: salonRecords.length });

      if (!salonRecords.length) {
        return res.status(400).json({
          error: 'SALON_NOT_FOUND',
          message:
            'Aucun salon trouvé pour le code fourni. Vérifiez le salon_id_string.'
        });
      }

      const salonRecord = salonRecords[0];
      const planRaw     = salonRecord.fields[PLAN_FIELD];
      const nbClients   = salonRecord.fields[CLIENTS_COUNT_FIELD] || 0;

      const plan =
        planRaw !== undefined && planRaw !== null
          ? String(planRaw).toLowerCase().trim()
          : null;

      logInfo(scope, 'Salon freemium data', {
        salonId: salonRecord.id,
        salonCode,
        planRaw,
        plan,
        nbClients
      });

      if (!plan) {
        return res.status(400).json({
          error: 'PLAN_NOT_SET',
          message:
            'Le plan du salon n’est pas défini. Merci de configurer le plan (fremium ou pro).'
        });
      }

      if (plan === 'fremium' && nbClients >= FREEMIUM_MAX_CLIENTS) {
        logInfo(scope, 'Freemium limit reached, blocking client creation', {
          salonId: salonRecord.id,
          salonCode,
          nbClients,
          maxAllowed: FREEMIUM_MAX_CLIENTS
        });

        return res.status(403).json({
          error: 'PLAN_LIMIT',
          message:
            'Limite du plan freemium atteinte (30 clients). Passez au plan Pro pour ajouter plus de clients.',
          data: {
            currentCount: nbClients,
            maxAllowed: FREEMIUM_MAX_CLIENTS
          }
        });
      }

      // Si plan = fremium mais nbClients < 30, on laisse créer.
      // Si plan = pro, aucune limite.
    }

    // ---------- Si on n'a pas bloqué, on crée normalement le record ----------
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${encodeURIComponent(
      table
    )}`;

    const response = await axios.post(
      url,
      { records: [{ fields }] },
      { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
    );

    const createdRecord = response.data.records?.[0];

    logInfo(scope, 'Create success', {
      table,
      recordId: createdRecord?.id
    });

    res.json(createdRecord);
  } catch (error) {
    logError('airtableCreate', 'Create failed', error, {
      status: error.response?.status
    });
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
 * Retour: record mis à jour
 */
app.post('/api/airtable/update', async (req, res) => {
  try {
    const { table, recordId, fields } = req.body;

    if (!table || !recordId || !fields) {
      return res.status(400).json({
        error: 'Paramètres manquants: table, recordId et fields requis'
      });
    }

    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${encodeURIComponent(
      table
    )}/${recordId}`;

    logInfo('airtableUpdate', 'Incoming update', {
      table,
      recordId,
      fieldKeys: Object.keys(fields)
    });

    const response = await axios.patch(
      url,
      { fields },
      { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
    );

    logInfo('airtableUpdate', 'Update success', {
      table,
      recordId: response.data.id
    });

    res.json(response.data);
  } catch (error) {
    logError('airtableUpdate', 'Update failed', error, {
      status: error.response?.status
    });
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

    logInfo('webhookProxy', 'Outgoing webhook call', {
      webhookName,
      envKey
    });

    const response = await axios.post(webhookUrl, payload);

    logInfo('webhookProxy', 'Webhook success', {
      webhookName,
      status: response.status
    });

    res.json(response.data);
  } catch (error) {
    logError('webhookProxy', 'Webhook failed', error, {
      status: error.response?.status
    });
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
  console.log(
    `\n📋 Vérifiez le .env pour: AIRTABLE_TOKEN, AIRTABLE_BASE, MAKE_WEBHOOK_* \n`
  );
});

