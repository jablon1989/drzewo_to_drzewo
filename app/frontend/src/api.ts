import { useMemo } from "react";
import { useSession } from "./session";
import type { Challenge, GameState, GuessResult, HintType, Tree, TreeFind } from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface UploadTicket {
  photo_id: string;
  content_type: string;
  photo_upload_url: string;
  thumb_upload_url: string;
}

/** Where the photo was taken (optional, stored with the find). */
export interface PhotoPlacement {
  tree_id: string;
  photo_id: string;
  lat?: number;
  lon?: number;
}

function createApi(token: string | undefined) {
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`/api${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token ?? ""}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let message = res.statusText;
      try {
        message = (await res.json()).message ?? message;
      } catch {
        /* not JSON */
      }
      throw new ApiError(res.status, message);
    }
    return res.status === 204 ? (undefined as T) : res.json();
  }

  return {
    state: () => call<GameState>("GET", "/state"),
    tree: (id: string) => call<{ tree: Tree; finds: TreeFind[] }>("GET", `/trees/${encodeURIComponent(id)}`),
    createUpload: () => call<UploadTicket>("POST", "/uploads"),
    challenges: () => call<{ challenges: Challenge[] }>("GET", "/challenges").then((r) => r.challenges),
    challenge: (id: string) => call<Challenge>("GET", `/challenges/${id}`),
    hideTree: (p: PhotoPlacement & { note?: string }) => call<Challenge>("POST", "/challenges", p),
    guess: (id: string, p: PhotoPlacement) => call<GuessResult>("POST", `/challenges/${id}/guesses`, p),
    hint: (id: string, type: HintType) => call<Challenge>("POST", `/challenges/${id}/hints`, { type }),
    giveUp: (id: string) => call<Challenge>("POST", `/challenges/${id}/give-up`),
    cancel: (id: string) => call<void>("DELETE", `/challenges/${id}`),
  };
}

export type Api = ReturnType<typeof createApi>;

export function useApi(): Api {
  const { token } = useSession();
  return useMemo(() => createApi(token), [token]);
}

/** PUT a file to a presigned S3 URL. */
export async function putToS3(url: string, file: Blob, contentType: string): Promise<void> {
  const res = await fetch(url, { method: "PUT", headers: { "Content-Type": contentType }, body: file });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
}
