/**
 * Turns whatever video URL a coach pastes into something embeddable.
 * Client-safe — no server-only imports.
 */

export type VideoProvider = "loom" | "youtube" | "vimeo" | "drive" | "unknown";

export type ParsedVideo = {
  provider: VideoProvider;
  /** Ready for an <iframe src>, or null if we couldn't work it out. */
  embedUrl: string | null;
  /** Where "open in a new tab" should point. */
  watchUrl: string;
  /** Still image for the card. Null where the provider doesn't expose one. */
  thumbnailUrl: string | null;
  /** Animated preview shown on hover — Loom's is a short looping GIF. */
  animatedUrl: string | null;
};

export function parseVideoUrl(input: string): ParsedVideo {
  const url = input.trim();

  // Loom — share links, and folders/embeds already in embed form
  const loom = url.match(/loom\.com\/(?:share|embed)\/([a-zA-Z0-9]+)/);
  if (loom) {
    return {
      provider: "loom",
      embedUrl: `https://www.loom.com/embed/${loom[1]}`,
      watchUrl: `https://www.loom.com/share/${loom[1]}`,
      // Deliberately null: a Loom thumbnail URL cannot be derived from the
      // share id. Workspace-restricted recordings 403 every guessable
      // format, and the ones that do resolve are often a black pre-roll
      // frame or a placeholder shared across unrelated videos. The real URL
      // comes from resolveLoomThumbnails, which goes through oEmbed and
      // verifies it belongs to this recording — see lib/loom.ts.
      thumbnailUrl: null,
      animatedUrl: null,
    };
  }

  // YouTube — watch, youtu.be, shorts, and already-embedded
  const yt = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  if (yt) {
    return {
      provider: "youtube",
      embedUrl: `https://www.youtube-nocookie.com/embed/${yt[1]}`,
      watchUrl: `https://www.youtube.com/watch?v=${yt[1]}`,
      thumbnailUrl: `https://img.youtube.com/vi/${yt[1]}/hqdefault.jpg`,
      animatedUrl: null,
    };
  }

  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) {
    return {
      provider: "vimeo",
      embedUrl: `https://player.vimeo.com/video/${vimeo[1]}`,
      watchUrl: `https://vimeo.com/${vimeo[1]}`,
      // Vimeo thumbnails need an API call, so the card falls back to the
      // gradient placeholder.
      thumbnailUrl: null,
      animatedUrl: null,
    };
  }

  // Google Drive video files
  const drive = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (drive) {
    return {
      provider: "drive",
      embedUrl: `https://drive.google.com/file/d/${drive[1]}/preview`,
      watchUrl: `https://drive.google.com/file/d/${drive[1]}/view`,
      thumbnailUrl: null,
      animatedUrl: null,
    };
  }

  return {
    provider: "unknown",
    embedUrl: null,
    watchUrl: url,
    thumbnailUrl: null,
    animatedUrl: null,
  };
}

export const PROVIDER_LABEL: Record<VideoProvider, string> = {
  loom: "Loom",
  youtube: "YouTube",
  vimeo: "Vimeo",
  drive: "Google Drive",
  unknown: "Link",
};
