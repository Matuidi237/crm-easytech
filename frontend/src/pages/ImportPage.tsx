import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ImportFile, PreviewResponse, commitImport, deleteImportFile, fetchImportFiles, previewImport } from "../api";
import { useLangue, type CleTraduction } from "../i18n";
import { fr } from "../i18n/fr";
import { en } from "../i18n/en";
import {
  IconAlert,
  IconArrowRight,
  IconCheck,
  IconImport,
  IconInbox,
  IconTrash,
} from "../components/Icons";

/**
 * Devine l'association colonne du fichier -> champ du CRM.
 *
 * L'entête du fichier est comparée aux libellés des DEUX langues : un fichier
 * français reste reconnu même si l'interface est en anglais, et l'inverse.
 */
function guessMapping(
  headers: string[],
  fields: string[],
  libelles: (champ: string) => string[]
): Record<string, string | null> {
  const mapping: Record<string, string | null> = {};
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const header of headers) {
    const normHeader = normalize(header);
    const match = fields.find(
      (f) => normalize(f) === normHeader || libelles(f).some((l) => normalize(l) === normHeader)
    );
    mapping[header] = match ?? null;
  }
  return mapping;
}

export default function ImportPage() {
  const { t, nombre, dateHeure } = useLangue();
  const champ = (f: string) => t(`champ.${f}` as CleTraduction);
  const champToutesLangues = (f: string) => [fr[`champ.${f}` as keyof typeof fr], en[`champ.${f}` as keyof typeof en]];

  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ totalRows: number; importedRows: number; errors: { ligne: number; message: string }[] } | null>(null);
  const [importing, setImporting] = useState(false);
  const [drag, setDrag] = useState(false);
  const [files, setFiles] = useState<ImportFile[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function loadFiles() {
    fetchImportFiles().then(setFiles).catch((e) => setError(e.message));
  }

  useEffect(loadFiles, []);

  async function handleFile(file: File) {
    setError(null);
    setResult(null);
    try {
      const res = await previewImport(file);
      setPreview(res);
      setMapping(guessMapping(res.headers, res.clientFields, champToutesLangues));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleCommit() {
    if (!preview) return;
    setImporting(true);
    setError(null);
    try {
      const res = await commitImport(preview.token, mapping);
      setResult(res);
      setPreview(null);
      loadFiles();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setImporting(false);
    }
  }

  async function handleDeleteFile(file: ImportFile) {
    if (!confirm(t("import.confirmerSuppression", { fichier: file.nomFichier, n: file.nbClientsActuels }))) return;
    setDeletingId(file.id);
    try {
      await deleteImportFile(file.id);
      setFiles((fs) => fs.filter((f) => f.id !== file.id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeletingId(null);
    }
  }

  const champsMappes = Object.values(mapping).filter(Boolean).length;
  const nomMappe = Object.values(mapping).includes("nom");

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t("import.titre")}</h1>
          <div className="page-sub">{t("import.sousTitre")}</div>
        </div>
        <Link to="/clients" className="btn btn-ghost">
          {t("import.voirClients")}
          <IconArrowRight size={15} />
        </Link>
      </div>

      {error && (
        <div className="alert alert-error">
          <IconAlert />
          {error}
        </div>
      )}

      {result && (
        <div className={result.errors.length > 0 ? "alert alert-warn" : "alert alert-success"}>
          {result.errors.length > 0 ? <IconAlert /> : <IconCheck />}
          <div>
            <strong>{t("import.resultat", { importees: result.importedRows, total: result.totalRows })}</strong>
            {result.errors.length > 0 && (
              <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                {result.errors.slice(0, 8).map((err, i) => (
                  <li key={i}>{t("import.ligneErreur", { ligne: err.ligne, message: err.message })}</li>
                ))}
                {result.errors.length > 8 && <li>{t("import.autresErreurs", { n: result.errors.length - 8 })}</li>}
              </ul>
            )}
          </div>
        </div>
      )}

      <div className="card">
        <div className="steps">
          <span className="step-num">1</span>
          <div className="card-title">{t("import.etape1")}</div>
        </div>
        <div
          className={`dropzone${drag ? " drag" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
          }}
          onClick={() => fileInputRef.current?.click()}
          style={{ marginTop: 14 }}
        >
          <div className="dz-icon">
            <IconImport size={22} />
          </div>
          <div className="dz-title">{t("import.deposer")}</div>
          <div className="dz-text">{t("import.parcourir")}</div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls,.json"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </div>
      </div>

      {preview && (
        <div className="card">
          <div className="card-head" style={{ marginBottom: 6 }}>
            <div>
              <div className="steps">
                <span className="step-num">2</span>
                <div className="card-title">{t("import.etape2")}</div>
              </div>
              <div className="card-sub" style={{ marginTop: 6 }}>
                {t("import.apercu", {
                  fichier: preview.fileName,
                  lignes: nombre(preview.totalRows),
                  mappees: champsMappes,
                  total: preview.headers.length,
                })}
              </div>
            </div>
            <span className="pill pill-brand">{preview.format.toUpperCase()}</span>
          </div>

          <div style={{ marginTop: 12 }}>
            {preview.headers.map((header) => (
              <div className="map-row" key={header}>
                <span className="map-source" title={header}>
                  {header}
                </span>
                <span className="map-arrow">
                  <IconArrowRight size={15} />
                </span>
                <select
                  className="input"
                  value={mapping[header] ?? ""}
                  onChange={(e) => setMapping((m) => ({ ...m, [header]: e.target.value || null }))}
                >
                  <option value="">{t("import.ignorerColonne")}</option>
                  {preview.clientFields.map((field) => (
                    <option key={field} value={field}>
                      {champ(field)}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {!nomMappe && (
            <div className="alert alert-warn" style={{ marginTop: 16 }}>
              <IconAlert />
              {t("import.nomObligatoire")}
            </div>
          )}

          <div style={{ marginTop: 18, display: "flex", gap: 10 }}>
            <button className="btn btn-primary" onClick={handleCommit} disabled={importing || !nomMappe}>
              {importing ? t("import.enCours") : t("import.lancer", { n: nombre(preview.totalRows) })}
            </button>
            <button className="btn btn-ghost" onClick={() => setPreview(null)} disabled={importing}>
              {t("commun.annuler")}
            </button>
          </div>
        </div>
      )}

      <div className="table-card">
        <div className="card-head">
          <div>
            <div className="card-title">{t("import.fichiersTitre")}</div>
            <div className="card-sub">{t("import.fichiersSousTitre")}</div>
          </div>
        </div>

        {files.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">
              <IconInbox />
            </div>
            <div className="empty-title">{t("import.aucunFichierTitre")}</div>
            <p className="empty-text" style={{ margin: 0 }}>
              {t("import.aucunFichierTexte")}
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("import.colFichier")}</th>
                  <th>{t("import.colImporteLe")}</th>
                  <th>{t("import.colClientsActuels")}</th>
                  <th>{t("import.colLignes")}</th>
                  <th>{t("import.colErreurs")}</th>
                  <th className="col-actions" />
                </tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <tr key={f.id}>
                    <td className="td-strong td-main">
                      {f.nomFichier} <span className="tag">{f.formatSource}</span>
                    </td>
                    <td data-label={t("import.colImporteLe")}>{dateHeure(f.createdAt)}</td>
                    <td className="num" data-label={t("import.colClientsActuels")}>
                      {nombre(f.nbClientsActuels)}
                    </td>
                    <td className="num" data-label={t("import.colLignes")}>
                      {nombre(f.nbLignesImportees)} / {nombre(f.nbLignesTotal)}
                    </td>
                    <td data-label={t("import.colErreurs")}>
                      {f.nbErreurs === 0 ? (
                        <span className="pill pill-success">{t("commun.aucun")}</span>
                      ) : (
                        <span className="pill pill-warn">{f.nbErreurs}</span>
                      )}
                    </td>
                    <td className="col-actions">
                      <div className="row-actions">
                        <button
                          className="link-action danger"
                          onClick={() => handleDeleteFile(f)}
                          disabled={deletingId === f.id}
                        >
                          {deletingId === f.id ? t("commun.suppression") : t("commun.supprimer")}
                        </button>
                      </div>
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
