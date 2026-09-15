import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { commissionDe, tauxEnNombre } from "../lib/commissions.js";

export const directionRouter = Router();

/**
 * Indicateurs de direction.
 *
 * Tout se calcule à partir de la table Vente, seule source qui sache QUAND,
 * PAR QUI et SUR QUOI le chiffre d'affaires a été réalisé. Le champ
 * « chiffreAffaires » porté par les fiches clients ne sert pas ici : c'est un
 * montant global saisi lors des imports, sans date ni ventilation, et
 * l'additionner aux ventes compterait deux fois les mêmes euros.
 *
 * Les montants sont en XAF, entiers : la devise n'a pas de sous-unité en
 * usage courant, afficher des centimes serait faux.
 */

/** Les Decimal de Prisma arrivent en objet ; on les ramène à un nombre. */
const nb = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

/** Premier jour du mois courant, puis du mois precedent. */
function bornesMensuelles(reference = new Date()) {
  const debutMois = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const debutMoisPrecedent = new Date(reference.getFullYear(), reference.getMonth() - 1, 1);
  return { debutMois, debutMoisPrecedent };
}

/**
 * Variation en pourcentage d'une periode a l'autre.
 *
 * Renvoie null quand la periode de reference est vide : afficher « +100% »
 * parce qu'on partait de zero ne veut rien dire, et « 0% » serait faux.
 * L'interface affiche alors « pas de comparaison » plutot qu'un chiffre.
 */
function variation(actuel: number, precedent: number): number | null {
  if (precedent <= 0) return null;
  return Math.round(((actuel - precedent) / precedent) * 100);
}

directionRouter.get("/tableau-de-bord", async (_req, res) => {
  const nbVentes = await prisma.vente.count();

  if (nbVentes === 0) {
    // Aucune vente : on le dit, plutôt que de renvoyer des zéros qui se
    // liraient comme un mauvais trimestre.
    return res.json({
      aDesVentes: false,
      nbVentes: 0,
      chiffreAffaires: 0,
      meilleurVendeur: null,
      meilleurProduit: null,
      beneficeMoyen: null,
      margeMoyennePct: null,
      nbClientsFactures: 0,
      variations: { chiffreAffaires: null, nbVentes: null, beneficeMoyen: null },
    });
  }

  const ventes = await prisma.vente.findMany({
    select: {
      clientId: true,
      vendeurId: true,
      vendeurNom: true,
      produit: true,
      quantite: true,
      prixAchat: true,
      prixVente: true,
      dateVente: true,
    },
  });

  const { debutMois, debutMoisPrecedent } = bornesMensuelles();
  /* Deux compteurs paralleles pour la comparaison mois a mois. Le mois en
     cours est incomplet par nature : l'interface le dit, plutot que de laisser
     croire a une chute le 2 du mois. */
  const moisCourant = { ca: 0, benefice: 0, nbVentes: 0 };
  const moisPrecedent = { ca: 0, benefice: 0, nbVentes: 0 };

  let chiffreAffaires = 0;
  let coutTotal = 0;
  const parVendeur = new Map<string, { nom: string; ca: number; nbVentes: number }>();
  const parProduit = new Map<string, { nbVentes: number; ca: number }>();
  const clientsFactures = new Set<string>();

  for (const v of ventes) {
    const montant = nb(v.prixVente) * v.quantite;
    const cout = nb(v.prixAchat) * v.quantite;
    chiffreAffaires += montant;
    coutTotal += cout;

    const periode =
      v.dateVente >= debutMois ? moisCourant : v.dateVente >= debutMoisPrecedent ? moisPrecedent : null;
    if (periode) {
      periode.ca += montant;
      periode.benefice += montant - cout;
      periode.nbVentes += 1;
    }

    // Un vendeur dont le compte a été supprimé garde sa ligne, sous son nom.
    const cleVendeur = v.vendeurId ?? `nom:${v.vendeurNom}`;
    const vendeur = parVendeur.get(cleVendeur) ?? { nom: v.vendeurNom, ca: 0, nbVentes: 0 };
    vendeur.ca += montant;
    vendeur.nbVentes += 1;
    parVendeur.set(cleVendeur, vendeur);

    const produit = parProduit.get(v.produit) ?? { nbVentes: 0, ca: 0 };
    // « Occurrence de vente » : on compte les ventes, pas les quantités.
    // Dix licences vendues d'un coup restent une occurrence.
    produit.nbVentes += 1;
    produit.ca += montant;
    parProduit.set(v.produit, produit);

    if (v.clientId) clientsFactures.add(v.clientId);
  }

  const meilleurVendeur = [...parVendeur.values()].sort((a, b) => b.ca - a.ca)[0] ?? null;
  const meilleurProduitEntree = [...parProduit.entries()].sort(
    // À nombre de ventes égal, le chiffre d'affaires départage.
    (a, b) => b[1].nbVentes - a[1].nbVentes || b[1].ca - a[1].ca
  )[0];

  const beneficeTotal = chiffreAffaires - coutTotal;

  res.json({
    aDesVentes: true,
    nbVentes,
    chiffreAffaires: Math.round(chiffreAffaires),
    meilleurVendeur: meilleurVendeur && {
      nom: meilleurVendeur.nom,
      ca: Math.round(meilleurVendeur.ca),
      nbVentes: meilleurVendeur.nbVentes,
      partPct: chiffreAffaires > 0 ? Math.round((meilleurVendeur.ca / chiffreAffaires) * 100) : 0,
    },
    meilleurProduit: meilleurProduitEntree && {
      nom: meilleurProduitEntree[0],
      nbVentes: meilleurProduitEntree[1].nbVentes,
      ca: Math.round(meilleurProduitEntree[1].ca),
      partPct: Math.round((meilleurProduitEntree[1].nbVentes / nbVentes) * 100),
    },
    /* Bénéfice moyen PAR VENTE : c'est ce qu'on peut comparer d'une période à
       l'autre. Le taux de marge l'accompagne, parce qu'un bénéfice moyen seul
       ne dit pas s'il vient de gros volumes ou de bonnes marges. */
    beneficeMoyen: Math.round(beneficeTotal / nbVentes),
    beneficeTotal: Math.round(beneficeTotal),
    margeMoyennePct: chiffreAffaires > 0 ? Math.round((beneficeTotal / chiffreAffaires) * 100) : 0,
    nbClientsFactures: clientsFactures.size,

    /* Mois en cours compare au mois precedent. Seuls trois indicateurs s'y
       pretent : un « meilleur vendeur » ou un « meilleur produit » sont des
       noms, leur variation n'aurait aucun sens. */
    variations: {
      chiffreAffaires: variation(moisCourant.ca, moisPrecedent.ca),
      nbVentes: variation(moisCourant.nbVentes, moisPrecedent.nbVentes),
      beneficeMoyen: variation(
        moisCourant.nbVentes > 0 ? moisCourant.benefice / moisCourant.nbVentes : 0,
        moisPrecedent.nbVentes > 0 ? moisPrecedent.benefice / moisPrecedent.nbVentes : 0
      ),
    },
  });
});

/** Ce qui remplace un pays, un secteur ou un vendeur absent. */
const NON_RENSEIGNE = "Non renseigné";

/** Combien de barres avant de replier la traîne. */
const MAX_LIGNES = 8;

type Cumul = { montant: number; nbVentes: number };

/** Replie tout ce qui dépasse en une ligne « Autres », valeurs comprises. */
function replier<T extends { label: string }>(lignes: T[], garder: number, libelleReste: string, sommer: (t: T) => number) {
  if (lignes.length <= garder) return lignes;
  const tete = lignes.slice(0, garder);
  const reste = lignes.slice(garder).reduce((s, l) => s + sommer(l), 0);
  return reste > 0 ? [...tete, { label: libelleReste, montant: reste, nbVentes: 0 } as unknown as T] : tete;
}

/**
 * Analyses du tableau de bord de direction.
 *
 * Les quatre ventilations du chiffre d'affaires et les trois regroupements de
 * produits sont calculés d'un seul tenant et renvoyés ensemble. Changer de
 * filtre à l'écran est alors immédiat, sans aller-retour réseau ni attente :
 * la table des ventes est petite, la recalculer intégralement coûte moins
 * cher qu'une requête par dimension.
 */
directionRouter.get("/analyses", async (_req, res) => {
  const ventes = await prisma.vente.findMany({
    select: {
      produit: true,
      quantite: true,
      prixAchat: true,
      prixVente: true,
      vendeurNom: true,
      clientNom: true,
      dateVente: true,
      client: { select: { pays: true, secteurActivite: true } },
    },
    orderBy: { dateVente: "desc" },
  });

  /** Clés de regroupement d'une vente, une par dimension proposée à l'écran. */
  const dimensions = (v: (typeof ventes)[number]) => ({
    pays: v.client?.pays || NON_RENSEIGNE,
    secteur: v.client?.secteurActivite || NON_RENSEIGNE,
    commercial: v.vendeurNom || NON_RENSEIGNE,
    produit: v.produit,
  });

  // -------------------------------------------------- Chiffre d'affaires
  const ca: Record<string, Map<string, Cumul>> = {
    pays: new Map(),
    secteur: new Map(),
    commercial: new Map(),
    produit: new Map(),
  };

  // ------------------- Ventes par produit, à l'intérieur de chaque groupe
  const parGroupe: Record<string, Map<string, Map<string, Cumul>>> = {
    commercial: new Map(),
    pays: new Map(),
    secteur: new Map(),
  };

  for (const v of ventes) {
    const montant = nb(v.prixVente) * v.quantite;
    const cles = dimensions(v);

    for (const dim of Object.keys(ca)) {
      const cle = cles[dim as keyof typeof cles];
      const acc = ca[dim].get(cle) ?? { montant: 0, nbVentes: 0 };
      acc.montant += montant;
      acc.nbVentes += 1;
      ca[dim].set(cle, acc);
    }

    for (const dim of Object.keys(parGroupe)) {
      const cle = cles[dim as keyof typeof cles];
      const produits = parGroupe[dim].get(cle) ?? new Map<string, Cumul>();
      const acc = produits.get(v.produit) ?? { montant: 0, nbVentes: 0 };
      acc.montant += montant;
      // « Le plus vendu » se compte en ventes, pas en quantités : dix
      // licences en une fois restent une vente.
      acc.nbVentes += 1;
      produits.set(v.produit, acc);
      parGroupe[dim].set(cle, produits);
    }
  }

  const classement = (m: Map<string, Cumul>) =>
    [...m.entries()]
      .map(([label, c]) => ({ label, montant: Math.round(c.montant), nbVentes: c.nbVentes }))
      .sort((a, b) => b.montant - a.montant);

  const chiffreAffaires = Object.fromEntries(
    Object.entries(ca).map(([dim, m]) => [
      dim,
      replier(classement(m), MAX_LIGNES, "Autres", (l) => l.montant),
    ])
  );

  /* Pour chaque groupe, le produit qui y revient le plus souvent. À nombre de
     ventes égal, le chiffre d'affaires départage : deux produits ex aequo en
     volume ne pèsent pas la même chose. */
  const meilleursProduits = Object.fromEntries(
    Object.entries(parGroupe).map(([dim, groupes]) => [
      dim,
      [...groupes.entries()]
        .map(([groupe, produits]) => {
          const [produit, c] = [...produits.entries()].sort(
            (a, b) => b[1].nbVentes - a[1].nbVentes || b[1].montant - a[1].montant
          )[0];
          const totalGroupe = [...produits.values()].reduce((s, p) => s + p.nbVentes, 0);
          return {
            groupe,
            produit,
            nbVentes: c.nbVentes,
            montant: Math.round(c.montant),
            // Part du produit dominant dans les ventes du groupe : dit si le
            // « meilleur » écrase les autres ou s'il gagne de justesse.
            partPct: totalGroupe > 0 ? Math.round((c.nbVentes / totalGroupe) * 100) : 0,
          };
        })
        .sort((a, b) => b.nbVentes - a.nbVentes || b.montant - a.montant)
        .slice(0, MAX_LIGNES),
    ])
  );

  /* Ordre global des produits, tous filtres confondus.
     C'est lui qui fixe la couleur de chaque produit à l'écran. Sans cet ordre
     stable, la teinte suivrait le rang dans la vue courante : changer de
     filtre repeindrait les produits, et un même produit changerait de couleur
     d'une vue à l'autre. La couleur doit suivre l'entité, jamais son rang. */
  const ordreProduits = classement(ca.produit).map((l) => l.label);

  /* Evolution des douze derniers mois, mois vides compris : un trou dans une
     serie temporelle est une information, le masquer donnerait une courbe
     faussement reguliere. */
  const maintenant = new Date();
  const parMois: { mois: string; ca: number; benefice: number; nbVentes: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(maintenant.getFullYear(), maintenant.getMonth() - i, 1);
    parMois.push({
      mois: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      ca: 0,
      benefice: 0,
      nbVentes: 0,
    });
  }
  const indexMois = new Map(parMois.map((m, i) => [m.mois, i]));
  for (const v of ventes) {
    const cle = `${v.dateVente.getFullYear()}-${String(v.dateVente.getMonth() + 1).padStart(2, "0")}`;
    const i = indexMois.get(cle);
    if (i === undefined) continue;
    const montant = nb(v.prixVente) * v.quantite;
    parMois[i].ca += montant;
    parMois[i].benefice += montant - nb(v.prixAchat) * v.quantite;
    parMois[i].nbVentes += 1;
  }

  res.json({
    chiffreAffaires,
    meilleursProduits,
    ordreProduits,
    parMois: parMois.map((m) => ({ ...m, ca: Math.round(m.ca), benefice: Math.round(m.benefice) })),
    dernieresVentes: ventes.slice(0, 8).map((v) => ({
      dateVente: v.dateVente,
      clientNom: v.clientNom,
      produit: v.produit,
      vendeurNom: v.vendeurNom,
      quantite: v.quantite,
      montant: Math.round(nb(v.prixVente) * v.quantite),
      benefice: Math.round((nb(v.prixVente) - nb(v.prixAchat)) * v.quantite),
    })),
  });
});


/* ==========================================================================
   Équipes
   ========================================================================== */

/**
 * Agrégats de vente par vendeur.
 *
 * groupBy ne sait pas multiplier deux colonnes ; le chiffre d'affaires se
 * recompose donc ligne à ligne. La table des ventes reste petite et cette
 * lecture sert plusieurs vues, autant la factoriser.
 */
async function agregatsParVendeur() {
  const lignes = await prisma.vente.findMany({
    select: { vendeurId: true, prixVente: true, prixAchat: true, quantite: true, dateVente: true },
  });

  const par = new Map<string, { ca: number; benefice: number; nbVentes: number; derniereVente: Date | null }>();
  for (const l of lignes) {
    if (!l.vendeurId) continue;
    const acc = par.get(l.vendeurId) ?? { ca: 0, benefice: 0, nbVentes: 0, derniereVente: null };
    acc.ca += nb(l.prixVente) * l.quantite;
    acc.benefice += (nb(l.prixVente) - nb(l.prixAchat)) * l.quantite;
    acc.nbVentes += 1;
    if (!acc.derniereVente || l.dateVente > acc.derniereVente) acc.derniereVente = l.dateVente;
    par.set(l.vendeurId, acc);
  }
  return par;
}

/** Rôles qui composent chaque équipe affichée au directeur général. */
const ROLES_COMMERCIALE = ["RESPONSABLE_COMMERCIAL", "COMMERCIAL"] as const;
const ROLES_PROJET = ["CHEF_DE_PROJET"] as const;

/**
 * Page « Nos équipes » : un encart par équipe, sans le détail.
 *
 * On ne renvoie que ce que les encarts affichent. Le détail d'une équipe a sa
 * propre route : charger toutes les ventes de tout le monde pour dessiner deux
 * vignettes serait du gaspillage.
 */
directionRouter.get("/equipes", async (_req, res) => {
  const [commerciaux, chefsProjet, agregats, projetsTousChefs] = await Promise.all([
    prisma.utilisateur.findMany({
      where: { role: { in: [...ROLES_COMMERCIALE] } },
      select: { id: true, actif: true, pays: true },
    }),
    prisma.utilisateur.findMany({
      where: { role: { in: [...ROLES_PROJET] } },
      select: { id: true, actif: true, pays: true },
    }),
    agregatsParVendeur(),
    prisma.projet.findMany({ select: SELECT_BILAN }),
  ]);

  const cumul = commerciaux.reduce(
    (acc, c) => {
      const a = agregats.get(c.id);
      if (a) {
        acc.ca += a.ca;
        acc.benefice += a.benefice;
        acc.nbVentes += a.nbVentes;
      }
      return acc;
    },
    { ca: 0, benefice: 0, nbVentes: 0 }
  );

  res.json({
    commerciale: {
      effectif: commerciaux.length,
      effectifActif: commerciaux.filter((c) => c.actif).length,
      // Pays distincts couverts, ce que l'encart annonce comme portée.
      nbPays: new Set(commerciaux.map((c) => c.pays).filter(Boolean)).size,
      chiffreAffaires: Math.round(cumul.ca),
      benefice: Math.round(cumul.benefice),
      nbVentes: cumul.nbVentes,
    },
    projet: {
      effectif: chefsProjet.length,
      effectifActif: chefsProjet.filter((c) => c.actif).length,
      nbPays: new Set(chefsProjet.map((c) => c.pays).filter(Boolean)).size,
      ...bilanProjets(projetsTousChefs),
    },
  });
});

/**
 * Liste de l'équipe commerciale.
 *
 * La recherche et le filtre pays sont appliqués en base plutôt qu'à l'écran :
 * la liste a vocation à grandir, et filtrer côté navigateur obligerait à tout
 * télécharger. « mode: insensitive » parce qu'on cherche un nom, pas une
 * chaîne exacte.
 */
directionRouter.get("/equipe-commerciale", async (req, res) => {
  const recherche = String(req.query.recherche ?? "").trim();
  const pays = String(req.query.pays ?? "").trim();

  const filtres: Record<string, unknown> = { role: { in: [...ROLES_COMMERCIALE] } };
  if (pays) filtres.pays = pays;
  if (recherche) {
    filtres.OR = [
      { nomComplet: { contains: recherche, mode: "insensitive" } },
      { email: { contains: recherche, mode: "insensitive" } },
      { identifiant: { contains: recherche, mode: "insensitive" } },
    ];
  }

  const [membres, tousPays, agregats] = await Promise.all([
    prisma.utilisateur.findMany({
      where: filtres,
      select: {
        id: true,
        nomComplet: true,
        identifiant: true,
        email: true,
        fonction: true,
        role: true,
        actif: true,
        pays: true,
        tauxCommissionPct: true,
      },
    }),
    /* Facette du filtre : calculée sur toute l'équipe et non sur le résultat
       courant, sinon choisir un pays effacerait les autres choix de la liste
       et on ne pourrait plus en changer. */
    prisma.utilisateur.findMany({
      where: { role: { in: [...ROLES_COMMERCIALE] }, pays: { not: null } },
      select: { pays: true },
      distinct: ["pays"],
      orderBy: { pays: "asc" },
    }),
    agregatsParVendeur(),
  ]);

  const lignes = membres
    .map((m) => {
      const a = agregats.get(m.id);
      const benefice = Math.round(a?.benefice ?? 0);
      return {
        id: m.id,
        nomComplet: m.nomComplet,
        identifiant: m.identifiant,
        email: m.email,
        fonction: m.fonction,
        role: m.role,
        actif: m.actif,
        pays: m.pays,
        chiffreAffaires: Math.round(a?.ca ?? 0),
        benefice,
        nbVentes: a?.nbVentes ?? 0,
        derniereVente: a?.derniereVente ?? null,
        commission: commissionDe(benefice, m.tauxCommissionPct),
      };
    })
    /* Du plus gros contributeur au plus petit : c'est le classement que
       cherche un directeur général, pas l'ordre alphabétique. */
    .sort((a, b) => b.chiffreAffaires - a.chiffreAffaires || a.nomComplet.localeCompare(b.nomComplet));

  res.json({ membres: lignes, pays: tousPays.map((p) => p.pays as string) });
});

/** Fiche d'un commercial : ce qu'il a réalisé, et le détail de ses ventes. */
directionRouter.get("/commercial/:id", async (req, res) => {
  const membre = await prisma.utilisateur.findFirst({
    where: { id: req.params.id, role: { in: [...ROLES_COMMERCIALE] } },
    select: {
      id: true,
      nomComplet: true,
      identifiant: true,
      email: true,
      fonction: true,
      role: true,
      actif: true,
      pays: true,
      dernierAcces: true,
      tauxCommissionPct: true,
      responsable: { select: { id: true, nomComplet: true } },
    },
  });

  /* 404 et non 403 : on ne révèle pas qu'un identifiant existe mais désigne
     quelqu'un d'autre qu'un commercial. Cohérent avec les fiches clients. */
  if (!membre) return res.status(404).json({ error: "Commercial introuvable." });

  const ventes = await prisma.vente.findMany({
    where: { vendeurId: membre.id },
    orderBy: { dateVente: "desc" },
    select: {
      id: true,
      dateVente: true,
      clientNom: true,
      produit: true,
      quantite: true,
      prixAchat: true,
      prixVente: true,
    },
  });

  let ca = 0;
  let benefice = 0;
  const clients = new Set<string>();
  const maintenant = new Date();
  const parMois: { mois: string; ca: number; benefice: number; nbVentes: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(maintenant.getFullYear(), maintenant.getMonth() - i, 1);
    parMois.push({
      mois: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      ca: 0,
      benefice: 0,
      nbVentes: 0,
    });
  }
  const indexMois = new Map(parMois.map((m, i) => [m.mois, i]));

  const detail = ventes.map((v) => {
    const montant = nb(v.prixVente) * v.quantite;
    const marge = (nb(v.prixVente) - nb(v.prixAchat)) * v.quantite;
    ca += montant;
    benefice += marge;
    clients.add(v.clientNom);

    const cle = `${v.dateVente.getFullYear()}-${String(v.dateVente.getMonth() + 1).padStart(2, "0")}`;
    const i = indexMois.get(cle);
    if (i !== undefined) {
      parMois[i].ca += montant;
      parMois[i].benefice += marge;
      parMois[i].nbVentes += 1;
    }

    return {
      id: v.id,
      dateVente: v.dateVente,
      clientNom: v.clientNom,
      produit: v.produit,
      quantite: v.quantite,
      montant: Math.round(montant),
      benefice: Math.round(marge),
      /* Commission ligne à ligne : c'est ainsi qu'elle se vérifie. Un total
         seul ne se conteste pas, et une commission se conteste. */
      commission: commissionDe(marge, membre.tauxCommissionPct),
    };
  });

  // Position du commercial dans le chiffre d'affaires de toute l'équipe.
  const agregats = await agregatsParVendeur();
  const equipe = await prisma.utilisateur.findMany({
    where: { role: { in: [...ROLES_COMMERCIALE] } },
    select: { id: true },
  });
  const caEquipe = equipe.reduce((s, e) => s + (agregats.get(e.id)?.ca ?? 0), 0);
  const classement = equipe
    .map((e) => ({ id: e.id, ca: agregats.get(e.id)?.ca ?? 0 }))
    .sort((a, b) => b.ca - a.ca);

  res.json({
    membre: {
      id: membre.id,
      nomComplet: membre.nomComplet,
      identifiant: membre.identifiant,
      email: membre.email,
      fonction: membre.fonction,
      role: membre.role,
      actif: membre.actif,
      pays: membre.pays,
      dernierAcces: membre.dernierAcces,
      responsable: membre.responsable,
      tauxCommissionPct: tauxEnNombre(membre.tauxCommissionPct),
    },
    chiffreAffaires: Math.round(ca),
    benefice: Math.round(benefice),
    commissions: commissionDe(benefice, membre.tauxCommissionPct),
    margePct: ca > 0 ? Math.round((benefice / ca) * 100) : 0,
    nbVentes: ventes.length,
    nbClients: clients.size,
    partEquipePct: caEquipe > 0 ? Math.round((ca / caEquipe) * 100) : 0,
    rang: classement.findIndex((c) => c.id === membre.id) + 1,
    effectifEquipe: equipe.length,
    derniereVente: ventes[0]?.dateVente ?? null,
    parMois: parMois.map((m) => ({ ...m, ca: Math.round(m.ca), benefice: Math.round(m.benefice) })),
    ventes: detail,
  });
});


/* ==========================================================================
   Équipe projet
   ========================================================================== */

/** Projets encore ouverts : ni livrés, ni annulés. */
const STATUTS_OUVERTS = ["EN_PREPARATION", "EN_COURS", "EN_PAUSE"] as const;

type BilanProjets = {
  total: number;
  ouverts: number;
  livres: number;
  enRetard: number;
  annules: number;
  budgetPilote: number;
  budgetOuvert: number;
  /** Livrés au plus tard à la date promise, sur l'ensemble des livrés. */
  respectDelaisPct: number | null;
  avancementMoyenPct: number | null;
  derniereLivraison: Date | null;
};

type LigneProjet = {
  statut: string;
  budget: unknown;
  avancementPct: number;
  dateFinPrevue: Date;
  dateFinReelle: Date | null;
};

/**
 * Agrège un lot de projets.
 *
 * « En retard » se mesure sur la promesse tenue, pas sur un ressenti : un
 * projet encore ouvert dont l'échéance est passée est en retard, et un projet
 * livré après sa date promise compte comme un manquement au délai, même s'il
 * est aujourd'hui clos.
 */
function bilanProjets(projets: LigneProjet[], maintenant = new Date()): BilanProjets {
  let ouverts = 0;
  let livres = 0;
  let annules = 0;
  let enRetard = 0;
  let budgetPilote = 0;
  let budgetOuvert = 0;
  let livresDansLesDelais = 0;
  let sommeAvancement = 0;
  let derniereLivraison: Date | null = null;

  for (const p of projets) {
    const montant = nb(p.budget);
    const estOuvert = (STATUTS_OUVERTS as readonly string[]).includes(p.statut);

    // Un projet annulé n'a rien piloté : l'inclure gonflerait le budget.
    if (p.statut !== "ANNULE") budgetPilote += montant;

    if (estOuvert) {
      ouverts += 1;
      budgetOuvert += montant;
      sommeAvancement += p.avancementPct;
      if (p.dateFinPrevue < maintenant) enRetard += 1;
    } else if (p.statut === "LIVRE") {
      livres += 1;
      if (p.dateFinReelle && p.dateFinReelle <= p.dateFinPrevue) livresDansLesDelais += 1;
      if (p.dateFinReelle && (!derniereLivraison || p.dateFinReelle > derniereLivraison)) {
        derniereLivraison = p.dateFinReelle;
      }
    } else {
      annules += 1;
    }
  }

  return {
    total: projets.length,
    ouverts,
    livres,
    enRetard,
    annules,
    budgetPilote: Math.round(budgetPilote),
    budgetOuvert: Math.round(budgetOuvert),
    // Null et non zéro tant que rien n'est livré : on ne peut pas juger d'un
    // respect des délais sans livraison.
    respectDelaisPct: livres > 0 ? Math.round((livresDansLesDelais / livres) * 100) : null,
    avancementMoyenPct: ouverts > 0 ? Math.round(sommeAvancement / ouverts) : null,
    derniereLivraison,
  };
}

const SELECT_BILAN = {
  statut: true,
  budget: true,
  avancementPct: true,
  dateFinPrevue: true,
  dateFinReelle: true,
} as const;

/**
 * Liste de l'équipe projet, même contrat que l'équipe commerciale : recherche
 * et filtre pays appliqués en base, facette calculée sur tout l'effectif.
 */
directionRouter.get("/equipe-projet", async (req, res) => {
  const recherche = String(req.query.recherche ?? "").trim();
  const pays = String(req.query.pays ?? "").trim();

  const filtres: Record<string, unknown> = { role: { in: [...ROLES_PROJET] } };
  if (pays) filtres.pays = pays;
  if (recherche) {
    filtres.OR = [
      { nomComplet: { contains: recherche, mode: "insensitive" } },
      { email: { contains: recherche, mode: "insensitive" } },
      { identifiant: { contains: recherche, mode: "insensitive" } },
    ];
  }

  const [membres, tousPays, projets] = await Promise.all([
    prisma.utilisateur.findMany({
      where: filtres,
      select: {
        id: true,
        nomComplet: true,
        identifiant: true,
        email: true,
        fonction: true,
        role: true,
        actif: true,
        pays: true,
      },
    }),
    prisma.utilisateur.findMany({
      where: { role: { in: [...ROLES_PROJET] }, pays: { not: null } },
      select: { pays: true },
      distinct: ["pays"],
      orderBy: { pays: "asc" },
    }),
    prisma.projet.findMany({ select: { ...SELECT_BILAN, chefDeProjetId: true } }),
  ]);

  const parChef = new Map<string, LigneProjet[]>();
  for (const p of projets) {
    if (!p.chefDeProjetId) continue;
    const lot = parChef.get(p.chefDeProjetId) ?? [];
    lot.push(p);
    parChef.set(p.chefDeProjetId, lot);
  }

  const lignes = membres
    .map((m) => ({ ...m, ...bilanProjets(parChef.get(m.id) ?? []) }))
    /* Classés par charge en cours : c'est la question d'un directeur général,
       qui porte quoi en ce moment, pas qui a le plus livré depuis toujours. */
    .sort((a, b) => b.ouverts - a.ouverts || b.budgetOuvert - a.budgetOuvert || a.nomComplet.localeCompare(b.nomComplet));

  res.json({ membres: lignes, pays: tousPays.map((p) => p.pays as string) });
});

/** Fiche d'un chef de projet : son bilan, puis chacun de ses projets. */
directionRouter.get("/chef-projet/:id", async (req, res) => {
  const membre = await prisma.utilisateur.findFirst({
    where: { id: req.params.id, role: { in: [...ROLES_PROJET] } },
    select: {
      id: true,
      nomComplet: true,
      identifiant: true,
      email: true,
      fonction: true,
      role: true,
      actif: true,
      pays: true,
      dernierAcces: true,
    },
  });
  if (!membre) return res.status(404).json({ error: "Chef de projet introuvable." });

  const projets = await prisma.projet.findMany({
    where: { chefDeProjetId: membre.id },
    orderBy: [{ dateFinPrevue: "desc" }],
    select: {
      id: true,
      nom: true,
      clientNom: true,
      statut: true,
      budget: true,
      avancementPct: true,
      dateDebut: true,
      dateFinPrevue: true,
      dateFinReelle: true,
      vente: { select: { produit: true, vendeurNom: true } },
    },
  });

  const maintenant = new Date();
  const bilan = bilanProjets(projets, maintenant);

  // Position dans l'équipe, sur la charge en cours.
  const equipe = await prisma.utilisateur.findMany({
    where: { role: { in: [...ROLES_PROJET] } },
    select: { id: true },
  });
  const tous = await prisma.projet.findMany({ select: { ...SELECT_BILAN, chefDeProjetId: true } });
  const ouvertsPar = new Map<string, number>();
  for (const p of tous) {
    if (!p.chefDeProjetId) continue;
    if (!(STATUTS_OUVERTS as readonly string[]).includes(p.statut)) continue;
    ouvertsPar.set(p.chefDeProjetId, (ouvertsPar.get(p.chefDeProjetId) ?? 0) + 1);
  }
  const classement = equipe
    .map((e) => ({ id: e.id, ouverts: ouvertsPar.get(e.id) ?? 0 }))
    .sort((a, b) => b.ouverts - a.ouverts);

  res.json({
    membre,
    ...bilan,
    rang: classement.findIndex((c) => c.id === membre.id) + 1,
    effectifEquipe: equipe.length,
    projets: projets.map((p) => ({
      id: p.id,
      nom: p.nom,
      clientNom: p.clientNom,
      statut: p.statut,
      budget: Math.round(nb(p.budget)),
      avancementPct: p.avancementPct,
      dateDebut: p.dateDebut,
      dateFinPrevue: p.dateFinPrevue,
      dateFinReelle: p.dateFinReelle,
      produit: p.vente?.produit ?? null,
      vendeurNom: p.vente?.vendeurNom ?? null,
      /* Calculé ici et non à l'écran : le retard dépend de l'heure du serveur,
         pas de celle du poste qui consulte. */
      enRetard:
        (STATUTS_OUVERTS as readonly string[]).includes(p.statut) && p.dateFinPrevue < maintenant,
      joursDeDerive:
        p.statut === "LIVRE" && p.dateFinReelle
          ? Math.round((p.dateFinReelle.getTime() - p.dateFinPrevue.getTime()) / 86400000)
          : null,
    })),
  });
});
