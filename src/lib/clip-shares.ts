/**
 * Public share links for the "Video Clips" films — the ones the Digital
 * Facilitator's Guide links to and a framer plays for the room.
 *
 * Andrew, 24 Sept 2026: "the 'video clips' in the training videos for
 * clients don't have a sharable link." Most of those films are other
 * people's work (a TED talk, a CNN segment, a podcast, film scenes), so a
 * share link never puts our Drive copy on an open address (except the
 * `stream` films below). It opens
 * /watch/{slug}, which plays the rights-holder's OWN public version — TED's
 * YouTube upload, Carey Nieuwhof's channel, Fast Company's player — or, where
 * that cannot be embedded (CNN), sends the viewer to it. Each source below
 * was found and then re-checked by a second researcher: same film, same cut
 * (or the exact section of a longer one), uploaded by the owner.
 *
 * Three films have no usable official version — Mr. Holland's Opus and
 * Hope Baptist's "Jesus Follower" film (Will's private upload) have none at
 * all, and Smoke's (Movieclips) is 2:41 of our 6:56 scene. Andrew, 25 Sept:
 * "make the mr. holland's opus clip available to be shared … figure out the
 * hope baptist one", and of Smoke: "the 2:41 smoke clip won't work. do the
 * same for ours". Those three are `stream`: the page plays OUR copy,
 * through /api/clips/{slug}/video, which serves only a clip marked `stream`
 * here and never a Drive id from the request. The Drive files themselves
 * stay private. Every Video Clips film now has a link.
 *
 * Keyed by the Drive file id. A clip re-uploaded to Drive (rather than
 * replaced with Manage versions) gets a new id and silently loses its link:
 * update the id here. Client-safe — no server-only imports.
 */
export type ClipShare = {
  /** The file in the Video Clips folder. */
  driveId: string;
  /** /watch/{slug} — words, not the Drive id, so the address says what it is. */
  slug: string;
  title: string;
  /** One line under the title: who made it and what it is. */
  about: string;
  /** Who published the version the page plays or links to, or who made the film. */
  source: string;
  /** What the page puts in its player: an embeddable address. Absent: the page plays our copy (`stream`) or links out to `href`. */
  embed?: string;
  /** No official version exists: the page plays our own copy, streamed from Drive. */
  stream?: true;
  /** The rights-holder's own page for the film — shown as "Watch the original", and the whole page when there is no embed or stream. */
  href?: string;
  /** The picture for link previews (and the page, when it cannot embed). */
  poster: string;
};

export const CLIP_SHARES: ClipShare[] = [
  {
    driveId: "1wmTE67vqU48xX5ewko5BVP49UvMcjy6g",
    slug: "tom-wujec-make-toast",
    title: "Tom Wujec: Got a Wicked Problem? First, Tell Me How You Make Toast",
    about: "A TED talk on drawing a system to see a complex problem clearly (TEDGlobal 2013, 9 min).",
    source: "TED",
    embed: "https://www.youtube-nocookie.com/embed/_vS_b7cJn2A?rel=0",
    href: "https://www.youtube.com/watch?v=_vS_b7cJn2A",
    poster: "https://i.ytimg.com/vi/_vS_b7cJn2A/maxresdefault.jpg",
  },
  {
    driveId: "1ylSy5n1u4mYDdjLtSPmzhAl-JAUxthVM",
    slug: "carey-nieuwhof-john-mark-comer",
    // Carey's own title for the episode when Andrew recorded it; it is burned into the recording.
    title: "John Mark Comer on the Crisis in Discipleship and Why Church Services Aren’t Resonating",
    about:
      "John Mark Comer with Carey Nieuwhof on why church can feel underwhelming — the 22-minute section from 14:17 of The Carey Nieuwhof Leadership Podcast, episode 626.",
    source: "The Carey Nieuwhof Leadership Podcast",
    // The section Andrew recorded: 14:17 to 36:17 of the full 1:33:54 episode.
    embed: "https://www.youtube-nocookie.com/embed/qrVKA0_CyJc?start=857&end=2177&rel=0",
    href: "https://www.youtube.com/watch?v=qrVKA0_CyJc&t=857s",
    poster: "https://i.ytimg.com/vi/qrVKA0_CyJc/maxresdefault.jpg",
  },
  {
    driveId: "1NZQitrgzEeW518fc6Eipi4MA8BnK5a09",
    slug: "coca-cola-cuts-product-lines",
    title: "Coca-Cola Cuts Product Lines During Covid",
    about: "CNN Business, Risk Takers: CEO James Quincey on why Coca-Cola cut half its brands (5 min).",
    source: "CNN Business",
    // cnn.com refuses to be framed by another site, so this page sends the viewer to CNN.
    href: "https://www.cnn.com/videos/business/2021/12/10/coca-cola-tab-soda-coke-ceo-james-quincey-risk-takers-orig.cnn",
    poster: "/brand/videos/drive/1NZQitrgzEeW518fc6Eipi4MA8BnK5a09.jpg",
  },
  {
    driveId: "1LA64jM9t0q96gZhQ5AghcUDMjXH7G1Bv",
    slug: "dan-heath-making-strategy-simple",
    title: "Making Strategy Simple",
    about: "Dan Heath, co-author of Made to Stick, on how to say your strategy so your team gets it (Fast Company, 4 min).",
    source: "Fast Company",
    // Fast Company's own video page (its YouTube copy is private). Not embedded: Fast Company's player
    // runs an ad first and then autoplays its other videos, which does not belong on a page we send a church.
    href: "https://www.fastcompany.com/video/making-strategy-simple/4hBjub8W",
    // Fast Company's own still for the film (its title card), from JW Player's media API.
    poster: "https://assets-jpcust.jwpsrv.com/thumbnails/t06s9hho-720.jpg",
  },
  {
    driveId: "1DlTNiRqypLDQai1PlqmcdQTNayN-XcG2",
    slug: "how-churches-fake-gods-work",
    title: "How Churches Fake God’s Work",
    about: "A Gospel Coalition roundtable with Ray Ortlund, Darrin Patrick and Ryan Kelly on church programming (4 min).",
    source: "The Gospel Coalition",
    embed: "https://www.youtube-nocookie.com/embed/firgtj7hAJQ?rel=0",
    href: "https://www.youtube.com/watch?v=firgtj7hAJQ",
    poster: "https://i.ytimg.com/vi/firgtj7hAJQ/maxresdefault.jpg",
  },
  {
    driveId: "1D_6-WT2qM51Wej93_p5YaYo2eV2ld6_P",
    slug: "mr-hollands-opus-play-the-sunset",
    title: "Mr. Holland’s Opus: Play the Sunset",
    about: "Glenn Holland (Richard Dreyfuss) tells a struggling clarinetist to stop reading the notes and play the sunset (4½ min).",
    source: "Mr. Holland’s Opus (1995)",
    stream: true,
    poster: "/brand/videos/drive/1D_6-WT2qM51Wej93_p5YaYo2eV2ld6_P.jpg",
  },
  {
    driveId: "1BSPDsFMHqATSxcQ7QqCMww_uoNrzi6I0",
    slug: "smoke-my-lifes-work",
    title: "Smoke: My Life’s Work",
    about:
      "Auggie Wren (Harvey Keitel) shows Paul Benjamin (William Hurt) his life’s work — a photo of the same street corner every morning — tells him to slow down, and Paul finds his late wife in one of them (7 min).",
    source: "Smoke (1995)",
    stream: true,
    poster: "/brand/videos/drive/1BSPDsFMHqATSxcQ7QqCMww_uoNrzi6I0.jpg",
  },
  {
    driveId: "1kpUGeGrdbrkCAFQPPmxltuM4ViQxgL3u",
    slug: "hope-baptist-jesus-follower",
    title: "Hope Baptist: The Life of a Jesus Follower",
    about:
      "A short animated film from Hope Baptist Church: Jesus living His life in and through us, the three words Hope uses for our relationships, and the time we give them (3 min).",
    source: "Hope Baptist Church",
    stream: true,
    poster: "/brand/videos/drive/1kpUGeGrdbrkCAFQPPmxltuM4ViQxgL3u.jpg",
  },
];

export const clipShareByDriveId = new Map(CLIP_SHARES.map((c) => [c.driveId, c]));
export const clipShareBySlug = new Map(CLIP_SHARES.map((c) => [c.slug, c]));
