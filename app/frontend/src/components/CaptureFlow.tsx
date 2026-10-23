import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { putToS3, useApi, type PhotoPlacement } from "../api";
import { devicePosition, photoPosition, resizeToJpeg, type Position } from "../photo";
import { distanceM, formatDistance, nearestTrees, PARK_CENTER, type TreeData } from "../trees";
import type { Tree } from "../types";
import { TreeMap } from "./TreeMap";

// Trees are only marked as done through hide & seek: one player hides a tree,
// the other finds it (there is no "log any tree" mode).
export type CaptureMode = "hide" | "guess";

const COPY: Record<CaptureMode, { title: string; intro: string; submit: string }> = {
  hide: {
    title: "Hide a tree",
    intro:
      "Take a photo of Aura in front of a tree. The other player gets an e-mail with only the photo and has to find the tree.",
    submit: "Hide this tree",
  },
  guess: {
    title: "I found it!",
    intro: "Take a photo of Aura in front of the tree you think it is.",
    submit: "This is the tree",
  },
};

const FAR_FROM_PARK_M = 800;

interface Props {
  mode: CaptureMode;
  trees: TreeData;
  found?: Record<string, string[]>;
  /** Called after the photo is uploaded; do the API call for this mode. */
  onSubmit: (placement: PhotoPlacement & { note?: string }) => Promise<void>;
  onClose: () => void;
}

type Step = "photo" | "reading" | "tree" | "saving";

export function CaptureFlow({ mode, trees, found, onSubmit, onClose }: Props) {
  const api = useApi();
  const copy = COPY[mode];
  const [step, setStep] = useState<Step>("photo");
  const [error, setError] = useState<string>();
  const [preview, setPreview] = useState<string>();
  const [photo, setPhoto] = useState<Blob>();
  const [thumb, setThumb] = useState<Blob>();
  const [position, setPosition] = useState<Position>();
  const [selected, setSelected] = useState<Tree>();
  const [tagQuery, setTagQuery] = useState("");
  const [note, setNote] = useState("");
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => (preview ? URL.revokeObjectURL(preview) : undefined), [preview]);

  const parkDistance = position ? distanceM(position.lat, position.lon, PARK_CENTER[0], PARK_CENTER[1]) : undefined;
  const nearPark = parkDistance !== undefined && parkDistance < FAR_FROM_PARK_M;

  const nearby = useMemo(
    () => (position && nearPark ? nearestTrees(trees.list, position.lat, position.lon, 5) : []),
    [position, nearPark, trees],
  );

  const tagMatches = useMemo(() => {
    const q = tagQuery.replace(/\D/g, "");
    if (q.length < 3) return [];
    return trees.list.filter((t) => t.tag?.includes(q)).slice(0, 5);
  }, [tagQuery, trees]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(undefined);
    setStep("reading");
    setPreview(URL.createObjectURL(file));
    try {
      // GPS from the photo itself wins (works for photos picked from the gallery later);
      // otherwise use where the phone is now.
      const [fromPhoto, big, small] = await Promise.all([
        photoPosition(file),
        resizeToJpeg(file, 2048),
        resizeToJpeg(file, 480, 0.8),
      ]);
      const pos = fromPhoto ?? (await devicePosition());
      setPhoto(big);
      setThumb(small);
      setPosition(pos);
      const closeToPark = pos && distanceM(pos.lat, pos.lon, PARK_CENTER[0], PARK_CENTER[1]) < FAR_FROM_PARK_M;
      setSelected(closeToPark ? nearestTrees(trees.list, pos.lat, pos.lon, 1)[0]?.tree : undefined);
      setStep("tree");
    } catch (e) {
      setError((e as Error).message);
      setStep("photo");
    }
  }

  async function submit() {
    if (!photo || !thumb || !selected) return;
    setStep("saving");
    setError(undefined);
    try {
      const ticket = await api.createUpload();
      await Promise.all([
        putToS3(ticket.photo_upload_url, photo, ticket.content_type),
        putToS3(ticket.thumb_upload_url, thumb, ticket.content_type),
      ]);
      await onSubmit({
        tree_id: selected.id,
        photo_id: ticket.photo_id,
        lat: position?.lat,
        lon: position?.lon,
        ...(mode === "hide" && note.trim() ? { note: note.trim() } : {}),
      });
    } catch (e) {
      setError((e as Error).message);
      setStep("tree");
    }
  }

  const focus = selected
    ? { lat: selected.lat, lon: selected.lon, zoom: 19 }
    : position && nearPark
      ? { lat: position.lat, lon: position.lon, zoom: 19 }
      : { lat: PARK_CENTER[0], lon: PARK_CENTER[1], zoom: 17 };

  // Portal: the sheet must cover the tab bar, whatever page opened it.
  return createPortal(
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label={copy.title}>
      <div className="sheet">
        <header className="sheet-head">
          <h2>{copy.title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close" disabled={step === "saving"}>
            ✕
          </button>
        </header>

        {(step === "photo" || step === "reading") && (
          <div className="sheet-body">
            <p className="muted">{copy.intro}</p>
            {preview && <img className="capture-preview" src={preview} alt="" />}
            {step === "reading" ? (
              <p className="muted center">Reading photo and location…</p>
            ) : (
              <div className="stack">
                <button className="btn primary big" onClick={() => cameraInput.current?.click()}>
                  📷 Take photo
                </button>
                <button className="btn big" onClick={() => galleryInput.current?.click()}>
                  🖼️ Choose from gallery
                </button>
              </div>
            )}
            <input
              ref={cameraInput}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => onFile(e.target.files?.[0])}
            />
            <input
              ref={galleryInput}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => onFile(e.target.files?.[0])}
            />
            {error && <p className="error">{error}</p>}
          </div>
        )}

        {(step === "tree" || step === "saving") && (
          <div className="sheet-body capture-tree">
            <div className="capture-top">
              {preview && <img className="capture-thumb" src={preview} alt="Your photo" />}
              <div className="small">
                {!position && <p className="warn">No location – tap the tree on the map.</p>}
                {position && !nearPark && (
                  <p className="warn">
                    You're {formatDistance(parkDistance ?? 0)} from the park – tap the tree on the map.
                  </p>
                )}
                {position && nearPark && (
                  <p className="muted">
                    {position.source === "photo" ? "Location from the photo" : "Your current location"}
                    {position.accuracy ? ` (±${Math.round(position.accuracy)} m)` : ""}. Is this the tree?
                  </p>
                )}
              </div>
            </div>

            <TreeMap
              className="map map-capture"
              trees={trees.list}
              park={trees.park}
              found={mode === "guess" ? undefined : found}
              selectedId={selected?.id}
              onTreeClick={setSelected}
              me={position && nearPark ? position : undefined}
              focus={focus}
            />

            {nearby.length > 0 && (
              <div className="chips" aria-label="Nearest trees">
                {nearby.map(({ tree, distance }) => (
                  <button
                    key={tree.id}
                    className={`chip ${tree.id === selected?.id ? "active" : ""}`}
                    onClick={() => setSelected(tree)}
                  >
                    {tree.pl} <span className="muted">{formatDistance(distance)}</span>
                  </button>
                ))}
              </div>
            )}

            <details className="tag-search">
              <summary className="small muted">Can see the number plate on the trunk? Search by it</summary>
              <input
                className="input"
                inputMode="numeric"
                placeholder="e.g. 042476"
                value={tagQuery}
                onChange={(e) => setTagQuery(e.target.value)}
              />
              {tagMatches.map((t) => (
                <button key={t.id} className="chip" onClick={() => setSelected(t)}>
                  #{t.tag} · {t.pl}
                </button>
              ))}
            </details>

            {selected ? (
              <div className="selected-tree">
                <div>
                  <strong>{selected.pl}</strong>
                  <div className="small muted">
                    {[selected.la, selected.cm && `trunk ${selected.cm} cm`, selected.tag && `plate #${selected.tag}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
              </div>
            ) : (
              <p className="muted small">Tap a tree on the map.</p>
            )}

            {mode === "hide" && (
              <input
                className="input"
                maxLength={280}
                placeholder="Optional message, e.g. “Good luck 😈”"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            )}

            {error && <p className="error">{error}</p>}
            <div className="row">
              <button className="btn" onClick={() => setStep("photo")} disabled={step === "saving"}>
                Retake
              </button>
              <button className="btn primary grow" onClick={submit} disabled={!selected || step === "saving"}>
                {step === "saving" ? "Uploading…" : copy.submit}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
