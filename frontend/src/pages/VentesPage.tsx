import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  SuggestionClient,
  SuggestionProduit,
  TableauCommercial,
  creerVente,
  fetchProduitsConnus,
  fetchTableauCommercial,
  supprimerVente,
} from "../api";
import { useLangue } from "../i18n";
import ChampClient from "../components/ChampClient";
import { IconAlert, IconCheck, IconInbox, IconPlus } from "../components/Icons";

/** Date du jour au format attendu par un champ date, dans le fuseau local. */
function aujourdhui() {
  const d = new Date();
  const mois = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${mois}-${String(d.getDate()).padStart(2, "0")}`;
}

const VIDE = {
  clientId: null as string | null,
  clientNom: "",
  pays: "",
  secteurActivite: "",
  produit: "",
  quantite: "1",
  prixAchat: "",
  prixVente: "",
  dateVente: aujourdhui(),
};

/**
 * Saisie des ventes.
 *
 * C'est le seul écran qui alimente les statistiques : tout ce que le directeur
 * lit ensuite (chiffre d'affaires, meilleur vendeur, meilleur produit, marge,
 * commissions, ventilation par pays et par secteur) se calcule à partir de ce
 * formulaire.
 *
 * Il est découpé en trois temps numérotés, à qui, quoi, et pour combien, parce
 * qu'une vente se raconte dans cet ordre. Chaque champ porte la raison de son
 * existence, et le récapitulatif montre en direct ce que la vente va produire :
 * une marge négative se voit ici, pas dans le bilan du mois suivant.
 */
export default function VentesPage() {
  const { t, nombre, montant, montantCompact, date, dateHeure } = useLangue();

  const [form, setForm] = useState(VIDE);
  const [produits, setProduits] = useState<SuggestionProduit[]>([]);
  const [donnees, setDonnees] = useState<TableauCommercial | null>(null);
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

  const champ = (cle: keyof typeof VIDE, valeur: string) => setForm((f) => ({ ...f, [cle]: valeur }));

  /* Le rattachement ne survit pas à une modification du nom : laisser
     l'identifiant en place attribuerait la vente à la fiche précédente alors
     que l'écran affiche un autre nom. */
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

  /* Choisir un produit connu reprend ses derniers prix, sans jamais écraser ce
     qui a déjà été tapé : un tarif négocié n'est pas le tarif précédent. */
  function choisirProduit(nom: string) {
    const connu = produits.find((p) => p.produit === nom);
    setForm((f) => ({
      ...f,
      produit: nom,
      prixAchat: connu && !f.prixAchat ? String(connu.prixAchat) : f.prixAchat,
      prixVente: connu && !f.prixVente ? String(connu.prixVente) : f.prixVente,
    }));
  }

  const apercu = useMemo(() => {
    const q = parseInt(form.quantite, 10);
    const achat = Number(form.prixAchat);
    const vente = Number(form.prixVente);
    if (!Number.isInteger(q) || q < 1 || !Number.isFinite(achat) || !Number.isFinite(vente) || !form.prixVente) {
      return null;
    }
    const total = vente * q;
    const benefice = (vente - achat) * q;
    const taux = donnees?.commissions.tauxPct ?? null;
    return {
      total,
      benefice,
      margePct: total > 0 ? Math.round((benefice / total) * 100) : 0,
      commission: taux === null ? null : Math.round(Math.max(0, benefice) * (taux / 100)),
    };
  }, [form.quantite, form.prixAchat, form.prixVente, donnees]);

  /* Fiche inconnue : les deux champs qui alimentent les ventilations du
     directeur apparaissent. Sans eux la vente compterait dans le chiffre
     d'affaires mais nulle part dans sa répartition. */
  const clientNouveau = form.clientNom.trim().length > 0 && form.clientId === null;
  const complet =
    form.clientNom.trim().length > 0 && form.produit.trim().length > 0 && form.prixVente !== "" && !!apercu;

  async function envoyer(e: FormEvent) {
    e.preventDefault();
    setErreur(null);
    setSucces(null);
    setEnvoi(true);
    try {
      const r = await creerVente({
        clientId: form.clientId,
        clientNom: form.clientNom.trim(),
        nouveauClient: clientNouveau
          ? { pays: form.pays.trim(), secteurActivite: form.secteurActivite.trim() }
          : null,
        produit: form.produit.trim(),
        quantite: parseInt(form.quantite, 10),
        prixAchat: Number(form.prixAchat),
        prixVente: Number(form.prixVente),
        dateVente: form.dateVente,
      });
      setSucces(
        r.clientCree
          ? t("ve.enregistreeAvecClient", { montant: montantCompact(r.montant), client: form.clientNom.trim() })
          : t("ve.enregistree", { montant: montantCompact(r.montant) })
      );
      /* La date survit à la remise à zéro : on saisit souvent plusieurs ventes
         du même jour à la suite, et la retaper à chaque fois use. */
      setForm({ ...VIDE, dateVente: form.dateVente });
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

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t("nav.ventes")}</h1>
          <div className="page-sub">{t("ve.sousTitre")}</div>
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

      <form className="card form-vente" onSubmit={envoyer}>
        <div className="card-head">
          <div>
            <div className="card-title">{t("ve.formulaireTitre")}</div>
            <div className="card-sub">{t("ve.formulaireSousTitre")}</div>
          </div>
        </div>

        {/* 1. À qui ---------------------------------------------------- */}
        <section className="bloc-saisie">
          <div className="steps">
            <span className="step-num">1</span>
            <div className="bloc-titre">{t("ve.etapeClient")}</div>
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

        {/* 2. Quoi ----------------------------------------------------- */}
        <section className="bloc-saisie">
          <div className="steps">
            <span className="step-num">2</span>
            <div className="bloc-titre">{t("ve.etapeProduit")}</div>
          </div>

          <div className="form-grid form-grid-produit">
            <div className="field">
              <label htmlFor="vente-produit">{t("ve.produit")}</label>
              <input
                id="vente-produit"
                list="produits-connus"
                value={form.produit}
                onChange={(e) => choisirProduit(e.target.value)}
                placeholder={t("ve.produitPlaceholder")}
                autoComplete="off"
                required
              />
              {/* Liste native : elle propose sans interdire, exactement ce
                  qu'il faut pour un catalogue qui n'est pas encore figé. */}
              <datalist id="produits-connus">
                {produits.map((p) => (
                  <option key={p.produit} value={p.produit} />
                ))}
              </datalist>
              <div className="field-hint">{t("ve.produitAide")}</div>
            </div>

            <div className="field">
              <label htmlFor="vente-quantite">{t("ve.quantite")}</label>
              <input
                id="vente-quantite"
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={form.quantite}
                onChange={(e) => champ("quantite", e.target.value)}
                required
              />
            </div>
          </div>
        </section>

        {/* 3. Pour combien --------------------------------------------- */}
        <section className="bloc-saisie">
          <div className="steps">
            <span className="step-num">3</span>
            <div className="bloc-titre">{t("ve.etapePrix")}</div>
          </div>

          <div className="form-grid form-grid-trois">
            <div className="field">
              <label htmlFor="vente-achat">{t("ve.prixAchat")}</label>
              {/* La devise dans le champ plutôt que dans le libellé : elle
                  reste sous les yeux pendant qu'on tape le montant. */}
              <div className="champ-montant">
                <input
                  id="vente-achat"
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={form.prixAchat}
                  onChange={(e) => champ("prixAchat", e.target.value)}
                  placeholder="0"
                  required
                />
                <span className="champ-suffixe">XAF</span>
              </div>
              <div className="field-hint">{t("ve.prixAchatAide")}</div>
            </div>

            <div className="field">
              <label htmlFor="vente-vente">{t("ve.prixVente")}</label>
              <div className="champ-montant">
                <input
                  id="vente-vente"
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={form.prixVente}
                  onChange={(e) => champ("prixVente", e.target.value)}
                  placeholder="0"
                  required
                />
                <span className="champ-suffixe">XAF</span>
              </div>
              <div className="field-hint">{t("ve.prixVenteAide")}</div>
            </div>

            <div className="field">
              <label htmlFor="vente-date">{t("ve.dateVente")}</label>
              <input
                id="vente-date"
                type="date"
                value={form.dateVente}
                // Pas de vente datée demain : elle gonflerait le mois en cours.
                max={aujourdhui()}
                onChange={(e) => champ("dateVente", e.target.value)}
                required
              />
              <div className="field-hint">{t("ve.dateAide")}</div>
            </div>
          </div>
        </section>

        {apercu && apercu.benefice < 0 && (
          <div className="alert alert-warn">
            <IconAlert />
            {t("ve.alertePerte")}
          </div>
        )}

        {/* Barre de validation : le résultat de la saisie et le bouton au même
            endroit, pour n'enregistrer qu'après avoir vu ce qu'on enregistre. */}
        <div className="barre-vente">
          <div className="barre-chiffres">
            <div className="barre-case">
              <span className="barre-label">{t("ve.apercuMontant")}</span>
              <strong className="barre-valeur">{apercu ? montant(apercu.total) : "-"}</strong>
            </div>
            <div className="barre-case">
              <span className="barre-label">{t("ve.apercuBenefice")}</span>
              <strong className={`barre-valeur${apercu && apercu.benefice < 0 ? " valeur-negative" : ""}`}>
                {apercu ? montant(apercu.benefice) : "-"}
              </strong>
            </div>
            <div className="barre-case">
              <span className="barre-label">{t("ve.apercuMarge")}</span>
              <strong className="barre-valeur">{apercu ? `${apercu.margePct}%` : "-"}</strong>
            </div>
            <div className="barre-case">
              <span className="barre-label">{t("ve.apercuCommission")}</span>
              <strong className="barre-valeur">
                {!apercu ? "-" : apercu.commission === null ? t("co.tauxNonDefini") : montant(apercu.commission)}
              </strong>
            </div>
          </div>

          <button className="btn btn-primary" type="submit" disabled={envoi || !complet}>
            <IconPlus size={16} />
            {envoi ? t("ve.enregistrement") : t("ve.enregistrer")}
          </button>
        </div>
      </form>

      <div className="table-card">
        <div className="card-head">
          <div>
            <div className="card-title">{t("ve.listeTitre")}</div>
            <div className="card-sub">{t("co.historiqueSousTitre", { n: nombre(ventes.length) })}</div>
          </div>
          {donnees && <span className="tag">{montantCompact(donnees.chiffreAffaires.total)}</span>}
        </div>

        {donnees === null ? (
          <p className="muted-3" style={{ margin: 0, padding: 20 }}>
            {t("commun.chargementDonnees")}
          </p>
        ) : ventes.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">
              <IconInbox />
            </div>
            <div className="empty-title">{t("co.historiqueVideTitre")}</div>
            <p className="empty-text" style={{ margin: 0 }}>
              {t("ve.listeVideTexte")}
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("fc.colDate")}</th>
                  <th>{t("fc.colClient")}</th>
                  <th>{t("fc.colProduit")}</th>
                  <th>{t("fc.colQuantite")}</th>
                  <th>{t("fc.colMontant")}</th>
                  <th>{t("fc.colBenefice")}</th>
                  <th>{t("fc.colCommission")}</th>
                  <th className="col-actions" />
                </tr>
              </thead>
              <tbody>
                {ventes.map((v) => (
                  <tr key={v.id}>
                    <td data-label={t("fc.colDate")}>{dateHeure(v.dateVente)}</td>
                    <td className="td-strong td-main" data-label={t("fc.colClient")}>
                      {v.clientNom}
                    </td>
                    <td data-label={t("fc.colProduit")}>{v.produit}</td>
                    <td className="num" data-label={t("fc.colQuantite")}>
                      {nombre(v.quantite)}
                    </td>
                    <td className="num" data-label={t("fc.colMontant")} title={montant(v.montant)}>
                      {montantCompact(v.montant)}
                    </td>
                    <td
                      className={`num ${v.benefice >= 0 ? "num-positif" : "num-negatif"}`}
                      data-label={t("fc.colBenefice")}
                      title={montant(v.benefice)}
                    >
                      {v.benefice >= 0 ? "+" : ""}
                      {montantCompact(v.benefice)}
                    </td>
                    <td className="num" data-label={t("fc.colCommission")}>
                      {v.commission === null ? (
                        <span className="muted-3">-</span>
                      ) : (
                        <>
                          <span title={montant(v.commission)}>{montantCompact(v.commission)}</span>
                          <span className={`pill ${v.commissionVerseeLe ? "pill-success" : "pill-warn"} pill-reglement`}>
                            {v.commissionVerseeLe ? t("co.versee", { date: date(v.commissionVerseeLe) }) : t("co.due")}
                          </span>
                        </>
                      )}
                    </td>
                    <td className="col-actions">
                      {/* Une commission versée verrouille la ligne côté serveur :
                          le bouton disparaît plutôt que d'échouer au clic. */}
                      {v.commissionVerseeLe ? (
                        <span className="muted-3" title={t("ve.verrouilleeAide")}>
                          {t("ve.verrouillee")}
                        </span>
                      ) : (
                        <button type="button" className="link-action danger" onClick={() => annuler(v.id, v.clientNom)}>
                          {t("ve.annuler")}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
