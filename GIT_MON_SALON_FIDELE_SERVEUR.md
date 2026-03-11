# Mon Salon Fidèle – Serveur Node.js

Ce document résume la configuration Git/GitHub du projet **mon-salon-fidele-server** et les raisons pour lesquelles le code du serveur est versionné sur GitHub.

---

## 1. Rôle du repo `mon-salon-fidele-server`

Ce repo contient le serveur Node.js qui sert d’API sécurisée entre :

- le **frontend** (site monsalonfidele.com, dashboard, pages QR, etc.),  
- et **Airtable / Make**.

Objectifs principaux du serveur :

- Ne jamais exposer les tokens Airtable / Make au frontend.
- Fournir des endpoints génériques :
  - `POST /api/airtable/query` – lecture filtrée dans Airtable.
  - `POST /api/airtable/create` – création de records dans Airtable.
  - `POST /api/airtable/update` – mise à jour de records Airtable.
  - `POST /api/webhook/proxy` – proxy sécurisé vers des webhooks Make.

Depuis mars 2026, ce serveur gère aussi la **logique freemium vs pro** (limite de clients).

---

## 2. Pourquoi le serveur est sur GitHub

Mettre `server.js` et le projet sur GitHub apporte :

1. **Déploiement automatique sur Render**
   - Render est connecté au repo `Yotham238/mon-salon-fidele-server` sur la branche `main`.
   - À chaque `git push origin main`, Render peut déployer automatiquement la nouvelle version du serveur.

2. **Historique clair des changements**
   - Chaque modification importante (ex: ajout de la limite freemium 30 clients) est associée à un commit.
   - On peut revenir en arrière si un changement casse la prod.

3. **Travail propre entre local et prod**
   - Tu modifies **localement** (`nano server.js`),  
   - tu commits sur Git,  
   - tu pushes sur GitHub,  
   - Render récupère la version propre du repo (pas un fichier perdu dans ton /Users).

4. **Séparation claire entre :**
   - le code front (site, pages HTML/JS),
   - le code backend (serveur Node),
   - la configuration Airtable / Make.

---

## 3. Ce qu’on a mis en place concrètement

### 3.1. Clonage et travail dans le bon dossier

- Repo GitHub : `https://github.com/Yotham238/mon-salon-fidele-server`
- Sur le Mac, le clone est dans :

```bash
cd ~/Desktop/mon-salon-fidele-server
Toutes les modifications de serveur doivent se faire dans ce dossier, pas dans /Users/Yotham directement.

3.2. Clé SSH GitHub (authentification)
Pour pouvoir faire git push sans mot de passe classique :

Génération d’une clé SSH :

bash
ssh-keygen -t ed25519 -C "yothampinto230@gmail.com"
# fichier : ~/.ssh/id_ed25519 (+ id_ed25519.pub)
Ajout de la clé publique (id_ed25519.pub) dans GitHub → Settings → SSH and GPG Keys → New SSH key.

Changement du remote en SSH dans le repo :

bash
cd ~/Desktop/mon-salon-fidele-server
git remote set-url origin git@github.com:Yotham238/mon-salon-fidele-server.git
Résultat : git push origin main utilise la clé SSH pour s’authentifier.

3.3. Workflow Git utilisé
À chaque changement sur le serveur :

bash
cd ~/Desktop/mon-salon-fidele-server

# 1. Modifier le code
nano server.js
# (enregistrer, quitter)

# 2. Vérifier les fichiers modifiés
git status

# 3. Ajouter les fichiers à committer
git add server.js

# 4. Créer un commit explicite
git commit -m "Add freemium 30-clients limit via Formule salon_id_string"

# 5. Pousser vers GitHub
git push origin main
Ensuite, sur Render → service API → onglet Deploys → “Deploy latest commit” pour déployer la version à jour.

4. Logique freemium ajoutée dans server.js
Dans la route POST /api/airtable/create, on a ajouté une brique métier pour la table Clients :

Table prise en compte : "Clients".

Limite : 30 clients maximum pour un salon en plan fremium.

Champs utilisés :

Table Salon :

plan (sélection unique : pro / fremium).

Formule salon_id_string (identifiant salon).

Table Clients :

Formule salon_id_string (lookup / code du salon).

4.1. Étapes de la logique freemium
Au moment d’un POST /api/airtable/create :

Si table !== 'Clients' → comportement normal (pas de limite).

Si table === 'Clients' :

Récupération du code salon : fields['Formule salon_id_string'].

Recherche du salon correspondant dans la table Salon avec filterByFormula sur ce code.

Lecture du plan du salon.

Si plan === 'fremium' :

comptage des clients dans la table Clients ayant le même Formule salon_id_string,

si nbClients >= 30 :

réponse HTTP 403 avec un JSON :

error: "PLAN_LIMIT"

message: "Limite du plan freemium atteinte (30 clients). Passez au plan Pro pour ajouter plus de clients."

sinon : création normale du client dans Airtable.

Si plan === 'pro' ou salon introuvable → pas de blocage, création normale.

5. Pourquoi cette logique est côté serveur (et pas dans le front)
Mettre la limite dans le serveur plutôt que dans les pages HTML/JS :

Empêche les salons ou un script externe de contourner la limite via un appel direct à Airtable.

Centralise les règles business (freemium vs pro) dans un seul endroit.

Permet de faire évoluer la logique (limite e-mails, campagnes, offres…) sans toucher à toutes les pages.

En résumé :

GitHub sert à versionner et déployer ce serveur proprement.

Render lit ce repo et lance le Node server en prod.

La logique freemium vit dans /api/airtable/create, pilotée par Airtable (plan, Formule salon_id_string).
