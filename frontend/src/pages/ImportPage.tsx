import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ImportFile, PreviewResponse, commitImport, deleteImportFile, fetchImportFiles, previewImport } from "../api";
import {
  IconAlert,
  IconArrowRight,
  IconCheck,
  IconImport,
  IconInbox,
  IconTrash,
} from "../components/Icons";

const FIELD_LABELS: Record<string, string> = {
  nom: "Nom du client",
  adressePhysique: "Adresse physique",
  ville: "Ville",
  pays: "Pays",
  siteWeb: "Site web",
  emailContact: "Adresse mail",
  telephone: "Téléphone",
  nomContactInterne: "Nom du contact (interne)",
  commercialEnCharge: "Commercial en charge",
  secteurActivite: "Secteur d'activité",
  chiffreAffaires: "Chiffre d'affaires",
  notes: "Notes",
};

function guessMapping(headers: string[], fields: string[]): Record<string, string | null> {
  const mapping: Record<string, string | null> = {};
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const header of headers) {
    const normHeader = normalize(header);
    const match = fields.find((f) => normalize(FIELD_LABELS[f] ?? f) === normHeader || normalize(f) === normHeader);
    mapping[header] = match ?? null;
  }
  return mapping;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
}

export default function ImportPage() {
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
      setMapping(guessMapping(res.headers, res.clientFields));
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
    if (
      !confirm(
        `Supprimer « ${file.nomFichier} » ? Les ${file.nbClientsActuels} client(s) importés depuis ce fichier seront également supprimés.`
      )
    )
      return;
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
          <h1>Importer des clients</h1>
          <div className="page-sub">Ajoutez des clients depuis un fichier CSV, Excel ou JSON.</div>
        </div>
        <Link to="/clients" className="btn btn-ghost">
          Voir les clients
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
            <strong>
              {result.importedRows} / {result.totalRows} lignes importées.
            </strong>
            {result.errors.length > 0 && (
              <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                {result.errors.slice(0, 8).map((err, i) => (
                  <li key={i}>
                    Ligne {err.ligne} : {err.message}
                  </li>
                ))}
                {result.errors.length > 8 && <li>… et {result.errors.length - 8} autres.</li>}
              </ul>
            )}
          </div>
        </div>
      )}

      <div className="card">
        <div className="steps">
          <span className="step-num">1</span>
          <div className="card-title">Choisir un fichier</div>
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
          <div className="dz-title">Glissez-déposez votre fichier ici</div>
          <div className="dz-text">ou cliquez pour parcourir. CSV, XLSX ou JSON, 25 Mo maximum</div>
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
                <div className="card-title">Associer les colonnes</div>
              </div>
              <div className="card-sub" style={{ marginTop: 6 }}>
                {preview.fileName} · {preview.totalRows.toLocaleString("fr-FR")} lignes détectées ·{" "}
                {champsMappes} colonne{champsMappes > 1 ? "s" : ""} associée{champsMappes > 1 ? "s" : ""} sur{" "}
                {preview.headers.length}
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
                  <option value="">Ignorer cette colonne</option>
                  {preview.clientFields.map((field) => (
                    <option key={field} value={field}>
                      {FIELD_LABELS[field] ?? field}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {!nomMappe && (
            <div className="alert alert-warn" style={{ marginTop: 16 }}>
              <IconAlert />
              Associez une colonne au champ « Nom du client » pour pouvoir importer.
            </div>
          )}

          <div style={{ marginTop: 18, display: "flex", gap: 10 }}>
            <button className="btn btn-primary" onClick={handleCommit} disabled={importing || !nomMappe}>
              {importing ? "Import en cours…" : `Importer ${preview.totalRows.toLocaleString("fr-FR")} lignes`}
            </button>
            <button className="btn btn-ghost" onClick={() => setPreview(null)} disabled={importing}>
              Annuler
            </button>
          </div>
        </div>
      )}

      <div className="table-card">
        <div className="card-head">
          <div>
            <div className="card-title">Fichiers importés</div>
            <div className="card-sub">Supprimer un fichier retire aussi les clients qui en proviennent.</div>
          </div>
        </div>

        {files.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">
              <IconInbox />
            </div>
            <div className="empty-title">Aucun fichier importé</div>
            <p className="empty-text" style={{ margin: 0 }}>
              Les fichiers que vous importez apparaîtront ici, avec le nombre de clients qui en découlent.
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Fichier</th>
                  <th>Importé le</th>
                  <th>Clients actuels</th>
                  <th>Lignes</th>
                  <th>Erreurs</th>
                  <th className="col-actions" />
                </tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <tr key={f.id}>
                    <td className="td-strong td-main">
                      {f.nomFichier} <span className="tag">{f.formatSource}</span>
                    </td>
                    <td data-label="Importé le">{formatDate(f.createdAt)}</td>
                    <td className="num" data-label="Clients actuels">
                      {f.nbClientsActuels.toLocaleString("fr-FR")}
                    </td>
                    <td className="num" data-label="Lignes">
                      {f.nbLignesImportees.toLocaleString("fr-FR")} / {f.nbLignesTotal.toLocaleString("fr-FR")}
                    </td>
                    <td data-label="Erreurs">
                      {f.nbErreurs === 0 ? (
                        <span className="pill pill-success">Aucune</span>
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
                          {deletingId === f.id ? "Suppression…" : "Supprimer"}
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
