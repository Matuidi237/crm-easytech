# Monter une instance pour un autre client

Ce document décrit comment repartir de ce dépôt pour installer l'outil chez une
autre entreprise. Le choix retenu est **une instance par client** : une base de
données, un conteneur, un sous-domaine. Aucune donnée n'est partagée entre deux
clients, ce qui supprime d'emblée la classe de défaut la plus grave d'un système
mutualisé, celle où les données d'une entreprise apparaissent chez une autre.

## Avant de commencer : ce que le dépôt contient, et ne contient pas

Vérifié avant rédaction de ce document :

- **aucun fichier de données client** n'est suivi par git, seulement les
  migrations de schéma ;
- **aucun `.env`** n'est suivi, seulement les `.env.example` ;
- le jeu de démonstration **ne contient pas de liste de clients** : il lit les
  fiches déjà présentes en base et leur attribue des portefeuilles.

Un clone ne transporte donc rien de confidentiel. Ce qu'il transporte d'EasyTech
tient dans la marque, les comptes de démonstration et trois règles de gestion.

## 1. Le dépôt

```bash
git clone https://github.com/Matuidi237/crm-easytech.git crm-<client>
cd crm-<client>
git remote set-url origin <url-du-nouveau-depot>
git push -u origin main
```

L'historique est conservé volontairement. Ces quarante-huit commits portent le
raisonnement derrière chaque décision, et les messages expliquent pourquoi une
chose a été faite ainsi plutôt qu'autrement. Repartir d'un dépôt vierge ferait
gagner une minute et perdre la mémoire du projet.

## 2. Démarquer

### Fichiers à remplacer

| Chemin | Contenu |
|---|---|
| `frontend/public/brand/easytech-logo-blanc.png` | logo sur fond bleu, barre latérale |
| `frontend/public/brand/easytech-logo.png` | logo sur fond clair |
| `frontend/public/brand/login-visuel.jpg` | visuel de la page de connexion |

Garder les mêmes noms de fichiers évite de toucher au code. Sinon, le chemin est
écrit dans `frontend/src/Layout.tsx`.

### Textes à reprendre

- `frontend/index.html` : la balise `<title>`
- `frontend/src/Layout.tsx` : le libellé sous le logo et l'attribut `alt`
- `frontend/src/i18n/fr.ts` et `en.ts` : les clés `profil.emailPlaceholder`,
  `users.emailPlaceholder`, `partenaires.sousTitre`
- `README.md` : le titre et la description

Pour trouver ce qui resterait :

```bash
grep -rniI "easytech" --include=*.ts --include=*.tsx --include=*.html --include=*.css --include=*.md . | grep -v node_modules
```

Les occurrences restantes dans les commentaires de `commissions.ts`, `ventes.ts`
et `ACoutPage.tsx` décrivent le circuit de vente d'EasyTech. Elles sont sans
conséquence technique, mais il vaut mieux les réécrire au nom du nouveau client :
un commentaire qui parle d'une autre entreprise égare le prochain lecteur.

## 3. Les règles de gestion

Trois valeurs sont des constantes de code et non des paramètres. Elles sont
isolées à dessein, chacune dans un fichier, chacune documentée.

| Règle | Fichier | Valeur chez EasyTech |
|---|---|---|
| Barème de commission | `backend/src/lib/commissions.ts` | 3 % matériel, 5 % service, assis sur le bénéfice |
| Journée de travail | `backend/src/routes/planning.ts` | 8 heures, `MINUTES_CIBLE_PAR_JOUR` |
| Devise | `frontend/src/i18n/index.tsx` | XAF, sans sous-unité |

**Sur la devise, attention.** Le code suppose partout qu'il n'y a pas de
centimes et arrondit au franc, notamment dans `montantValide`. Un client qui
facture en euros ou en dollars perdrait ses décimales en silence. Si la nouvelle
instance change de devise, il faut traiter cette hypothèse, pas seulement
remplacer trois lettres.

**À deux clients, modifier ces constantes dans chaque fork est acceptable. À
trois, ce ne l'est plus** : chaque correctif devra être reporté à la main sur
chaque branche. C'est le moment où il faudra les sortir dans une table de
paramètres, sur le modèle de la matrice de permissions qui vit déjà en base.

## 4. Les modules à activer ou retirer

Tous les clients n'ont pas le même métier. Un client dont les commerciaux ne
sont pas commissionnés n'a que faire de l'onglet Commissions.

Aujourd'hui la navigation est écrite par rôle dans `frontend/src/vues.ts`, et
retirer un module consiste à retirer son entrée de la liste et sa route de
`App.tsx`. Les données et les routes du serveur restent en place, inactives.

Un registre de modules activables reste à construire. Il est la bonne réponse à
la fois pour la revente et pour le module RH à venir.

## 5. La base et le premier compte

```bash
cd backend
cp .env.example .env
```

Renseigner dans `.env` :

- `DATABASE_URL` : la base du nouveau client, vide
- `JWT_SECRET` : **une valeur neuve**, jamais celle d'une autre instance. Un
  secret partagé entre deux installations permet de se connecter à l'une avec
  un jeton émis par l'autre.
- `ADMIN_USERNAME` et `ADMIN_PASSWORD_HASH`
- `CORS_ORIGIN` : l'adresse du frontend de cette instance

Produire le haché du mot de passe administrateur :

```bash
node -e "require('bcryptjs').hash(process.argv[1],10).then(console.log)" "<mot-de-passe>"
```

Puis appliquer le schéma :

```bash
npx prisma migrate deploy
npx prisma generate
```

`migrate deploy` et non `migrate dev` : en production on applique les migrations
existantes, on n'en invente pas.

## 6. Le jeu de démonstration

```bash
npm run demo:dg           # installer
npm run demo:dg:etat      # voir ce qu'il en reste
npm run demo:dg:supprimer # tout retirer
```

Il porte des noms et des comptes propres à EasyTech. Pour une démonstration chez
un prospect, reprendre les noms dans `backend/scripts/demo-direction.mjs`, et
surtout **le retirer avant la mise en service réelle**. Tout ce qu'il crée porte
un drapeau `estDemo`, ce qui rend la suppression vérifiable plutôt que
seulement promise.

## 7. Déploiement

Voir `DEPLOIEMENT.md`, qui décrit l'installation Docker complète. Pour une
seconde instance sur le même VPS, les points à ne pas manquer :

- un nom de projet Docker distinct, sinon les conteneurs se remplacent ;
- des ports distincts, ou aucun port publié si tout passe par le proxy ;
- une base distincte, pas un schéma distinct dans la même base ;
- une entrée propre dans Nginx Proxy Manager, avec son certificat.

## 8. Ce qui manque encore pour une revente sereine

À dire au client, et à soi-même :

- **aucun test automatisé.** Avec une seule instance cela ne se voit pas. À
  partir de deux, chaque correctif doit être revalidé à la main sur chacune.
  C'est le poste qui coûtera le plus cher, et le premier à traiter.
- **aucune sauvegarde automatisée** décrite pour la base.
- **la révocation d'accès n'est pas immédiate** : un compte supprimé ou
  désactivé conserve l'usage de son jeton jusqu'à expiration, douze heures.
