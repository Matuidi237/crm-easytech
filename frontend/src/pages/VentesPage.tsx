import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  LigneCommande,
  NATURES_VENTE,
  NatureVente,
  SuggestionClient,
  SuggestionProduit,
  TableauCommercial,
  VenteCommercial,
  creerCommande,
  fetchProduitsConnus,
  fetchTableauCommercial,
  supprimerVente,
} from "../api";
import { useLangue } from "../i18n";
import ChampClient from "../components/ChampClient";
import ListeDeroulante from "../components/ListeDeroulante";
import { IconAlert, IconCheck, IconClose, IconInbox, IconPlus, IconTrash } from "../components/Icons";

/** Date du jour au format attendu par un champ date, dans le fuseau local. */
function aujourdhui() {
  const d = new Date();
  const mois = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${mois}-${String(d.getDate()).padStart(2, "0")}`;
}

type LigneSaisie = {
  produit: string;
  nature: NatureVente | "";
  quantite: string;
  prixVente: string;
};

const LIGNE_VIDE: LigneSaisie = { produit: "", nature: "", quantite: "1", prixVente: "" };

const VIDE = {
  clientId: null as string | null,
  clientNom: "",
  pays: "",
  secteurActivite: "",
  referenceCommande: "",
  dateVente: aujourdhui(),
  lignes: [{ ...LIGNE_VIDE }],
};

/**
 * Commandes validées.
 *
 * Chez EasyTech, le devis part de Zoho ; quand le client le valide, il devient
 * un document ferme. Cet écran ne crée donc pas une vente, il recopie ce
 * document, et tout y découle de ce fait.
 *
 * La référence Zoho ouvre la saisie : c'est elle qui relie la ligne à son
 * original, et c'est par elle qu'une synchronisation automatique reconnaîtra
 * un jour ce qui est déjà en base au lieu de le recréer.
 *
 * Une commande porte plusieurs lignes, comme le document d'origine. Et le prix
 * d'achat n'est pas demandé : le commercial ne le connaît pas. L'exiger ne
 * produirait pas une marge juste mais un chiffre inventé pour que le
 * formulaire accepte d'être validé.
 */
export default function VentesPage() {
  const { t, nombre, montant, montantCompact, date, dateHeure } = useLangue();

  const [form, setForm] = useState(VIDE);
  const [produits, setProduits] = useState<SuggestionProduit[]>([]);
  const [donnees, setDonnees] = useState<TableauCommercial | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  function recharger() {
    fetchTableauCommercial()
      .then(setDonnees)
      .catch((e) => setErreur(e.message));
  }

  useEffect(() => {
    recharger();
    fetchProduitsConnus()
      .then(setProduits)
      .catch(() => setProduits([]));
  }, []);

  const champ = (cle: "clientNom" | "pays" | "secteurActivite" | "referenceCommande" | "dateVente", valeur: string) =>
    setForm((f) => ({ ...f, [cle]: valeur }));

  /* Le rattachement ne survit pas à une modification du nom : laisser
     l'identifiant en place attribuerait la commande à la fiche précédente
     alors que l'écran affiche un autre nom. */
  function saisirNom(nom: string) {
    setForm((f) => ({ ...f, clientNom: nom, clientId: null }));
  }

  function retenirClient(c: SuggestionClient) {
    setForm((f) => ({
      ...f,
      clientNom: c.nom,
      clientId: c.id,
      pays: c.pays ?? "",
      secteurActivite: c.secteurActivite ?? "",
    }));
  }

  function majLigne(i: number, modif: Partial<LigneSaisie>) {
    setForm((f) => ({
      ...f,
      lignes: f.lignes.map((l, j) => (j === i ? { ...l, ...modif } : l)),
    }));
  }

  /* Choisir un produit connu reprend sa nature et son dernier prix, sans
     jamais écraser ce qui a déjà été tapé : un tarif négocié n'est pas le
     tarif précédent. */
  function choisirProduit(i: number, nom: string) {
    const connu = produits.find((p) => p.produit === nom);
    setForm((f) => ({
      ...f,
      lignes: f.lignes.map((l, j) =>
        j !== i
          ? l
          : {
              ...l,
              produit: nom,
              nature: connu && !l.nature ? connu.nature : l.nature,
              prixVente: connu && !l.prixVente ? String(connu.prixVente) : l.prixVente,
            }
      ),
    }));
  }

  const totalCommande = useMemo(
    () =>
      form.lignes.reduce((t, l) => {
        const q = parseInt(l.quantite, 10);
        const p = Number(l.prixVente);
        if (!Number.isInteger(q) || q < 1 || !Number.isFinite(p) || l.prixVente === "") return t;
        return t + p * q;
      }, 0),
    [form.lignes]
  );

  const ligneValide = (l: LigneSaisie) => {
    const q = parseInt(l.quantite, 10);
    const p = Number(l.prixVente);
    return (
      l.produit.trim() !== "" &&
      l.nature !== "" &&
      Number.isInteger(q) &&
      q >= 1 &&
      l.prixVente !== "" &&
      Number.isFinite(p) &&
      p >= 0
    );
  };

  /* Fiche inconnue : les deux champs qui alimentent les ventilations du
     directeur apparaissent. Sans eux la commande compterait dans le chiffre
     d'affaires mais nulle part dans sa répartition. */
  const clientNouveau = form.clientNom.trim().length > 0 && form.clientId === null;
  const complet =
    form.clientNom.trim().length > 0 &&
    form.referenceCommande.trim().length > 0 &&
    form.lignes.length > 0 &&
    form.lignes.every(ligneValide);

  async function envoyer(e: FormEvent) {
    e.preventDefault();
    setErreur(null);
    setSucces(null);
    setEnvoi(true);
    const lignes: LigneCommande[] = form.lignes.map((l) => ({
      produit: l.produit.trim(),
      nature: l.nature as NatureVente,
      quantite: parseInt(l.quantite, 10),
      prixVente: Number(l.prixVente),
    }));
    try {
      const r = await creerCommande({
        clientId: form.clientId,
        clientNom: form.clientNom.trim(),
        nouveauClient: clientNouveau
          ? { pays: form.pays.trim(), secteurActivite: form.secteurActivite.trim() }
          : null,
        referenceCommande: form.referenceCommande.trim(),
        dateVente: form.dateVente,
        lignes,
      });
      setSucces(
        r.clientCree
          ? t("ve.commandeEnregistreeAvecClient", {
              reference: r.referenceCommande,
              montant: montantCompact(r.montant),
              client: form.clientNom.trim(),
            })
          : t("ve.commandeEnregistree", {
              reference: r.referenceCommande,
              montant: montantCompact(r.montant),
            })
      );
      /* La date survit à la remise à zéro : on saisit souvent plusieurs
         commandes du même jour à la suite, et la retaper à chaque fois use. */
      setForm({ ...VIDE, dateVente: form.dateVente, lignes: [{ ...LIGNE_VIDE }] });
      setOuvert(false);
      recharger();
      fetchProduitsConnus()
        .then(setProduits)
        .catch(() => undefined);
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setEnvoi(false);
    }
  }

  async function annuler(id: string, client: string) {
    if (!confirm(t("ve.confirmerSuppression", { client }))) return;
    setErreur(null);
    setSucces(null);
    try {
      await supprimerVente(id);
      recharger();
    } catch (err) {
      setErreur((err as Error).message);
    }
  }

  const ventes = donnees?.ventes ?? [];

  /* Les lignes se regroupent par référence : c'est ainsi qu'elles existent
     dans Zoho, et les lire éparpillées obligerait à reconstituer de tête ce
     qu'un seul document contenait. */
  const commandes = useMemo(() => {
    const par = new Map<string, { reference: string | null; lignes: VenteCommercial[] }>();
    for (const v of ventes) {
      const cle = v.referenceCommande ?? `sans:${v.id}`;
      const groupe = par.get(cle) ?? { reference: v.referenceCommande ?? null, lignes: [] };
      groupe.lignes.push(v);
      par.set(cle, groupe);
    }
    return [...par.values()];
  }, [ventes]);

  const sansCout = donnees?.chiffreAffaires.ventesSansCout ?? 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t("nav.ventes")}</h1>
        </div>
        <div className="head-actions">
          <button className="btn btn-primary" onClick={() => setOuvert(true)} disabled={ouvert}>
            <IconPlus size={16} />
            {t("ve.nouvelleCommande")}
          </button>
        </div>
      </div>

      {erreur && (
        <div className="alert alert-error">
          <IconAlert />
          {erreur}
        </div>
      )}
      {succes && (
        <div className="alert alert-success">
          <IconCheck />
          {succes}
        </div>
      )}

      {/* Ce qui attend un prix d'achat. Le dire ici évite qu'un commercial
          croie sa commission oubliée alors qu'elle n'est pas calculable. */}
      {sansCout > 0 && (
        <p className="remarque">
          {/* Le singulier a sa propre phrase : « 1 de vos lignes attendent »
              est une faute, et une faute d'accord dans l'interface décrédibilise
              les chiffres qui l'entourent. */}
          <strong>
            {sansCout === 1 ? t("ve.enAttenteDeCoutUne") : t("ve.enAttenteDeCout", { n: nombre(sansCout) })}
          </strong>
          {". "}
          {sansCout === 1 ? t("ve.enAttenteDeCoutAideUne") : t("ve.enAttenteDeCoutAide")}
        </p>
      )}

      {ouvert && (
        <form className="panneau" onSubmit={envoyer}>
          <header className="panneau-tete">
            <h2>{t("ve.nouvelleCommande")}</h2>
            <span className="panneau-note">{t("ve.coutExplication")}</span>
          </header>

          {/* 1. Quel document ------------------------------------------- */}
          <section className="bloc-saisie">
            <div className="steps">
              <span className="step-num">1</span>
              <div className="bloc-titre">{t("ve.etapeDocument")}</div>
            </div>

            <div className="form-grid">
              <div className="field">
                <label htmlFor="vente-reference">{t("ve.reference")}</label>
                <input
                  id="vente-reference"
                  value={form.referenceCommande}
                  onChange={(e) => champ("referenceCommande", e.target.value)}
                  placeholder={t("ve.referencePlaceholder")}
                  autoComplete="off"
                  autoFocus
                  required
                />
                <div className="field-hint">{t("ve.referenceAide")}</div>
              </div>
              <div className="field">
                <label htmlFor="vente-date">{t("ve.dateVente")}</label>
                <input
                  id="vente-date"
                  type="date"
                  value={form.dateVente}
                  // Pas de commande datée demain : elle gonflerait le mois en cours.
                  max={aujourdhui()}
                  onChange={(e) => champ("dateVente", e.target.value)}
                  required
                />
                <div className="field-hint">{t("ve.dateAide")}</div>
              </div>
            </div>

            <div className="field">
              <label htmlFor="vente-client">{t("ve.client")}</label>
              <ChampClient valeur={form.clientNom} onChange={saisirNom} onChoisir={retenirClient} />
              <div className={`field-hint${clientNouveau ? " hint-nouveau" : ""}`}>
                {form.clientId ? t("ve.clientRattache") : clientNouveau ? t("ve.clientCree") : t("ve.clientAide")}
              </div>
            </div>

            {/* Pays et secteur ne s'affichent que pour une fiche à créer : sur
                une fiche existante ils sont déjà connus, et une seconde saisie
                ouvrirait la porte à deux valeurs contradictoires. */}
            {clientNouveau && (
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="vente-pays">{t("ve.pays")}</label>
                  <input
                    id="vente-pays"
                    value={form.pays}
                    onChange={(e) => champ("pays", e.target.value)}
                    placeholder={t("ve.paysPlaceholder")}
                  />
                  <div className="field-hint">{t("ve.paysAide")}</div>
                </div>
                <div className="field">
                  <label htmlFor="vente-secteur">{t("ve.secteur")}</label>
                  <input
                    id="vente-secteur"
                    value={form.secteurActivite}
                    onChange={(e) => champ("secteurActivite", e.target.value)}
                    placeholder={t("ve.secteurPlaceholder")}
                  />
                  <div className="field-hint">{t("ve.secteurAide")}</div>
                </div>
              </div>
            )}
          </section>

          {/* 2. Les lignes ---------------------------------------------- */}
          <section className="bloc-saisie">
            <div className="steps">
              <span className="step-num">2</span>
              <div className="bloc-titre">{t("ve.etapeLignes")}</div>
            </div>

            {form.lignes.map((l, i) => (
              <div className="ligne-commande" key={i}>
                <div className="ligne-tete">
                  <span className="ligne-num">{t("ve.ligneN", { n: nombre(i + 1) })}</span>
                  {form.lignes.length > 1 && (
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => setForm((f) => ({ ...f, lignes: f.lignes.filter((_, j) => j !== i) }))}
                      aria-label={t("ve.retirerLigne")}
                      title={t("ve.retirerLigne")}
                    >
                      <IconTrash size={15} />
                    </button>
                  )}
                </div>

                <div className="form-grid form-grid-produit">
                  <div className="field">
                    <label htmlFor={`produit-${i}`}>{t("ve.produit")}</label>
                    {/* Saisie libre : la liste reprend ce qui a déjà été vendu
                        pour éviter que « Pare-feu » et « Parefeu » deviennent
                        deux produits dans les statistiques du directeur. */}
                    <ListeDeroulante
                      id={`produit-${i}`}
                      valeur={l.produit}
                      options={produits.map((p) => p.produit)}
                      onChange={(v) => choisirProduit(i, v)}
                      placeholder={t("ve.produitPlaceholder")}
                      libre
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`quantite-${i}`}>{t("ve.quantite")}</label>
                    <input
                      id={`quantite-${i}`}
                      type="number"
                      min={1}
                      step={1}
                      inputMode="numeric"
                      value={l.quantite}
                      onChange={(e) => majLigne(i, { quantite: e.target.value })}
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`prix-${i}`}>{t("ve.prixVente")}</label>
                    <div className="champ-montant">
                      <input
                        id={`prix-${i}`}
                        type="number"
                        min={0}
                        step={1}
                        inputMode="numeric"
                        value={l.prixVente}
                        onChange={(e) => majLigne(i, { prixVente: e.target.value })}
                        placeholder="0"
                        required
                      />
                      <span className="champ-suffixe">XAF</span>
                    </div>
                  </div>
                </div>

                {/* La nature fixe le taux de commission : elle se choisit sur
                    deux cases qui affichent leur taux avant le clic. */}
                <div className="field">
                  <span className="label-bloc">{t("ve.nature")}</span>
                  <div className="choix-nature" role="radiogroup" aria-label={t("ve.nature")}>
                    {NATURES_VENTE.map((n) => (
                      <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={l.nature === n}
                        className={`carte-choix${l.nature === n ? " on" : ""}`}
                        onClick={() => majLigne(i, { nature: n })}
                      >
                        <span className="carte-choix-nom">{t(`nature.${n}` as "nature.MATERIEL")}</span>
                        <span className="carte-choix-note">{t(`nature.aide.${n}` as "nature.aide.MATERIEL")}</span>
                        <span className="carte-choix-taux">
                          {t("ve.tauxCommission", {
                            taux: nombre(
                              donnees?.commissions.tauxNegociePct ?? donnees?.commissions.bareme[n] ?? 0
                            ),
                          })}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}

            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setForm((f) => ({ ...f, lignes: [...f.lignes, { ...LIGNE_VIDE }] }))}
            >
              <IconPlus size={15} />
              {t("ve.ajouterLigne")}
            </button>
          </section>

          <div className="barre-vente">
            <div className="barre-chiffres">
              <div className="barre-case">
                <span className="barre-label">{t("ve.totalCommande")}</span>
                <strong className="barre-valeur">{totalCommande > 0 ? montant(totalCommande) : "—"}</strong>
              </div>
              <div className="barre-case">
                <span className="barre-label">{t("ve.nLignes", { n: nombre(form.lignes.length) })}</span>
                <strong className="barre-valeur">{form.referenceCommande.trim() || "—"}</strong>
              </div>
            </div>

            <div className="form-actions" style={{ margin: 0 }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setOuvert(false);
                  setForm({ ...VIDE, lignes: [{ ...LIGNE_VIDE }] });
                }}
              >
                <IconClose size={15} />
                {t("commun.annuler")}
              </button>
              <button className="btn btn-primary" type="submit" disabled={envoi || !complet}>
                <IconCheck size={16} />
                {envoi ? t("ag.ajoutEnCours") : t("commun.enregistrer")}
              </button>
            </div>
          </div>
        </form>
      )}

      <section className="panneau">
        <header className="panneau-tete">
          <h2>{t("ve.commandesTitre")}</h2>
          <span className="panneau-note">{t("ve.nLignesListe", { n: nombre(ventes.length) })}</span>
        </header>

        {ventes.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">
              <IconInbox />
            </div>
            <div className="empty-title">{t("ve.commandesTitre")}</div>
            <p className="empty-text" style={{ margin: 0 }}>
              {t("ve.listeVideCommandes")}
            </p>
            <button className="btn btn-primary btn-sm" style={{ marginTop: 6 }} onClick={() => setOuvert(true)}>
              <IconPlus size={15} />
              {t("ve.nouvelleCommande")}
            </button>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="table-nue">
              <thead>
                <tr>
                  <th>{t("ve.colReference")}</th>
                  <th>{t("fc.colDate")}</th>
                  <th>{t("fc.colClient")}</th>
                  <th>{t("fc.colProduit")}</th>
                  <th className="num">{t("ve.quantite")}</th>
                  <th className="num">{t("fc.colMontant")}</th>
                  <th className="num">{t("fc.colBenefice")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {commandes.map((c) =>
                  c.lignes.map((v, i) => (
                    <tr key={v.id} className={i === 0 ? "commande-debut" : undefined}>
                      {/* La référence n'est écrite qu'une fois par commande :
                          la répéter sur chaque ligne ferait lire trois fois le
                          même numéro pour un seul document. */}
                      <td className="td-strong" data-label={t("ve.colReference")}>
                        {i === 0 ? c.reference ?? <span className="muted-3">—</span> : ""}
                      </td>
                      <td className="td-date" data-label={t("fc.colDate")}>
                        {i === 0 ? date(v.dateVente) : ""}
                      </td>
                      <td className="td-main" data-label={t("fc.colClient")}>
                        {i === 0 ? v.clientNom : ""}
                      </td>
                      <td data-label={t("fc.colProduit")}>{v.produit}</td>
                      <td className="num" data-label={t("ve.quantite")}>
                        {nombre(v.quantite)}
                      </td>
                      <td className="num" data-label={t("fc.colMontant")} title={montant(v.montant)}>
                        {montantCompact(v.montant)}
                      </td>
                      <td
                        className="num"
                        data-label={t("fc.colBenefice")}
                        title={v.benefice === null ? undefined : montant(v.benefice)}
                      >
                        {v.benefice === null ? (
                          <span className="muted-3">{t("ve.aChiffrer")}</span>
                        ) : (
                          montantCompact(v.benefice)
                        )}
                      </td>
                      <td className="num">
                        {/* Une commission versée verrouille la ligne côté
                            serveur : le bouton disparaît plutôt que d'échouer. */}
                        {v.commissionVerseeLe ? (
                          <span className="muted-3" title={t("ve.verrouilleeAide")}>
                            {t("co.versee", { date: date(v.commissionVerseeLe) })}
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="icon-btn"
                            onClick={() => annuler(v.id, v.clientNom)}
                            aria-label={t("commun.supprimer")}
                            title={t("commun.supprimer")}
                          >
                            <IconTrash size={15} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
