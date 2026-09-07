import { Router } from "express";
import { prisma } from "../lib/prisma.js";

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
    },
  });

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

  res.json({
    chiffreAffaires,
    meilleursProduits,
    ordreProduits,
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

/**
 * Vue « Équipes » : chaque responsable commercial avec les comptes qui lui
 * sont rattachés, et ce que chacun a réalisé.
 */
directionRouter.get("/equipes", async (_req, res) => {
  const comptes = await prisma.utilisateur.findMany({
    where: { role: { in: ["RESPONSABLE_COMMERCIAL", "COMMERCIAL"] } },
    select: {
      id: true,
      nomComplet: true,
      identifiant: true,
      fonction: true,
      role: true,
      actif: true,
      responsableId: true,
      dernierAcces: true,
      _count: { select: { clientsPossedes: true } },
    },
    orderBy: { nomComplet: "asc" },
  });

  const ventes = await prisma.vente.groupBy({
    by: ["vendeurId"],
    _sum: { quantite: true },
    _count: { _all: true },
  });

  // groupBy ne sait pas multiplier deux colonnes : le chiffre d'affaires par
  // vendeur se recompose donc à partir des lignes.
  const lignes = await prisma.vente.findMany({
    select: { vendeurId: true, prixVente: true, prixAchat: true, quantite: true },
  });
  const caParVendeur = new Map<string, { ca: number; benefice: number }>();
  for (const l of lignes) {
    if (!l.vendeurId) continue;
    const acc = caParVendeur.get(l.vendeurId) ?? { ca: 0, benefice: 0 };
    acc.ca += nb(l.prixVente) * l.quantite;
    acc.benefice += (nb(l.prixVente) - nb(l.prixAchat)) * l.quantite;
    caParVendeur.set(l.vendeurId, acc);
  }
  const nbVentesParVendeur = new Map(ventes.map((v) => [v.vendeurId ?? "", v._count._all]));

  const enrichir = (c: (typeof comptes)[number]) => ({
    id: c.id,
    nomComplet: c.nomComplet,
    identifiant: c.identifiant,
    fonction: c.fonction,
    role: c.role,
    actif: c.actif,
    dernierAcces: c.dernierAcces,
    nbClients: c._count.clientsPossedes,
    nbVentes: nbVentesParVendeur.get(c.id) ?? 0,
    chiffreAffaires: Math.round(caParVendeur.get(c.id)?.ca ?? 0),
    benefice: Math.round(caParVendeur.get(c.id)?.benefice ?? 0),
  });

  const responsables = comptes.filter((c) => c.role === "RESPONSABLE_COMMERCIAL");
  const commerciaux = comptes.filter((c) => c.role === "COMMERCIAL");

  const equipes = responsables.map((r) => {
    const membres = commerciaux.filter((c) => c.responsableId === r.id).map(enrichir);
    const chef = enrichir(r);
    return {
      responsable: chef,
      membres,
      // Le responsable vend aussi : son propre chiffre compte dans l'équipe.
      chiffreAffaires: chef.chiffreAffaires + membres.reduce((s, m) => s + m.chiffreAffaires, 0),
      nbVentes: chef.nbVentes + membres.reduce((s, m) => s + m.nbVentes, 0),
    };
  });

  res.json({
    equipes,
    // Un commercial sans responsable n'apparaîtrait dans aucune équipe : on
    // le montre à part plutôt que de le laisser disparaître de la vue.
    sansEquipe: commerciaux.filter((c) => !c.responsableId).map(enrichir),
  });
});
