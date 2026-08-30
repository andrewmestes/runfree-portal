import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Client-side instance (browser). Subject to RLS as the signed-in user. */
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

/**
 * Server-side client that queries as a specific signed-in user, so every
 * policy in docs/data-model.md is enforced exactly as it would be for a
 * direct PostgREST call. This is the client every API route should use for
 * project/session/deliverable data.
 *
 * This is the fork's core departure from the CVF portal, which read the
 * caller's identity with the service-role key and then queried everything
 * else with that same key — service-role bypasses RLS entirely, so isolation
 * there depended on every route remembering its own `where project_id = …`.
 * Here, the database enforces it: forgetting a filter fails closed instead of
 * leaking another project's rows.
 */
export function createUserClient(accessToken: string): SupabaseClient<Database> {
  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false },
  });
}

/**
 * Service-role client. Bypasses RLS entirely, so it is reserved for
 * operations that have no signed-in user to act as — sending an invite,
 * listing auth.users to check for an existing login. It must never be used
 * to read or write project/session/deliverable data: that is exactly the
 * CVF single-tenant assumption this fork exists to remove (see
 * docs/forking-guide.md, "Access is checked in route handlers").
 *
 * Falling back to the anon client when the service key is missing would look
 * forgiving and isn't: it would just make every admin-only call fail its own
 * check silently. A missing service key is a broken deploy, so it's reported
 * loudly at import time instead. Guarded to the server only — this module is
 * also imported from client components for the plain `supabase` export, and
 * the service key is never present in the browser bundle.
 */
if (typeof window === "undefined" && !supabaseServiceKey) {
  console.error(
    "SUPABASE_SERVICE_ROLE_KEY is not set. Invites and other admin-only operations will fail."
  );
}

export const supabaseAdmin: SupabaseClient<Database> = supabaseServiceKey
  ? createClient<Database>(supabaseUrl, supabaseServiceKey)
  : supabase;

/**
 * Portal-wide identity. Deliberately separate from a project membership:
 * the same person is an editor on one project and a viewer on another, which
 * project_members.role covers. See migration 031.
 */
export type AccountRole =
  | "admin"
  | "runfree_team"
  | "framer_subscribed"
  | "framer"
  | "client";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          is_staff: boolean;
          is_owner: boolean;
          /** Portal-wide, independent of any project membership — see 006_client_portal_expansion.sql. */
          certification_access: boolean;
          /** Headshot, in the deliverable-images bucket. One face per person, not per project. */
          avatar_path: string | null;
          /** Last time they loaded the portal (056). Coarse, hourly. */
          last_seen_at: string | null;
          /**
           * Who someone is portal-wide (migration 031). Distinct from
           * project_members.role, which is what they may do on ONE project.
           * The three booleans above are legacy, kept in sync by a trigger
           * while the CVF app still reads them.
           */
          account_role: AccountRole;
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          is_staff?: boolean;
          is_owner?: boolean;
          certification_access?: boolean;
          avatar_path?: string | null;
          created_at?: string;
        };
        Update: {
          full_name?: string | null;
          is_staff?: boolean;
          is_owner?: boolean;
          certification_access?: boolean;
          avatar_path?: string | null;
          account_role?: AccountRole;
        };
        Relationships: [];
      };
      templates: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          structure: unknown;
          is_active: boolean;
          /** Only Pivvot produces a Vision Stack — see migration 018. */
          has_vision_stack: boolean;
          /** False for 1:1 engagements, which have no client "team" — see 020. */
          is_group: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          description?: string | null;
          structure?: unknown;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          name?: string;
          slug?: string;
          description?: string | null;
          structure?: unknown;
          is_active?: boolean;
        };
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          name: string;
          template_id: string | null;
          visibility: "private" | "team";
          drive_folder_id: string | null;
          /** Storage path in the deliverable-images bucket, {project_id}/logo-*.ext */
          logo_path: string | null;
          location: string | null;
          website_url: string | null;
          about: string | null;
          /** "What your team is doing right now" — see migration 018. */
          priorities: string | null;
          priorities_updated_at: string | null;
          created_by: string;
          archived_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          template_id?: string | null;
          visibility?: "private" | "team";
          drive_folder_id?: string | null;
          logo_path?: string | null;
          location?: string | null;
          website_url?: string | null;
          about?: string | null;
          priorities?: string | null;
          priorities_updated_at?: string | null;
          created_by: string;
          archived_at?: string | null;
          created_at?: string;
        };
        Update: {
          name?: string;
          template_id?: string | null;
          visibility?: "private" | "team";
          drive_folder_id?: string | null;
          logo_path?: string | null;
          location?: string | null;
          website_url?: string | null;
          about?: string | null;
          priorities?: string | null;
          priorities_updated_at?: string | null;
          archived_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "projects_template_id_fkey";
            columns: ["template_id"];
            referencedRelation: "templates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "projects_created_by_fkey";
            columns: ["created_by"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      project_members: {
        Row: {
          project_id: string;
          profile_id: string;
          /** viewer: read-only. editor: writes sessions/deliverables. admin: editor + manages membership. */
          role: "viewer" | "editor" | "admin";
          /** Their job title where they work ("Executive Pastor"). Carries NO permissions — see 010. */
          org_role: string | null;
          /** Marks the RunFree person leading this engagement. */
          is_lead: boolean;
          added_at: string;
          /**
           * When THIS member pinned the project to the top of their own list.
           * Per person, not per project — see migration 038. Only writable
           * through set_project_pinned(); manage_members keeps this table
           * admin-only for direct UPDATE.
           */
          pinned_at: string | null;
          /**
           * Task create/edit/complete without the admin role (053). Ignored
           * when role = 'admin', which already carries it.
           */
          can_manage_tasks: boolean;
        };
        Insert: {
          project_id: string;
          profile_id: string;
          role?: "viewer" | "editor" | "admin";
          org_role?: string | null;
          is_lead?: boolean;
          added_at?: string;
          pinned_at?: string | null;
          can_manage_tasks?: boolean;
        };
        Update: {
          role?: "viewer" | "editor" | "admin";
          org_role?: string | null;
          is_lead?: boolean;
          pinned_at?: string | null;
          can_manage_tasks?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey";
            columns: ["project_id"];
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_members_profile_id_fkey";
            columns: ["profile_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      sessions: {
        Row: {
          id: string;
          project_id: string;
          title: string;
          /** Freeform module/section label, e.g. "Mod #1 FUNNEL FUSION" — not an enum, since it varies per template and a from-scratch project has none. */
          section: string | null;
          held_on: string | null;
          position: number;
          recording_url: string | null;
          transcript: string | null;
          takeaways: string | null;
          commitments: string | null;
          /** What we covered — the session recap a coach writes afterwards. */
          recap: string | null;
          published_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          title: string;
          section?: string | null;
          held_on?: string | null;
          position?: number;
          recording_url?: string | null;
          transcript?: string | null;
          takeaways?: string | null;
          commitments?: string | null;
          recap?: string | null;
          published_at?: string | null;
          created_at?: string;
        };
        Update: {
          title?: string;
          section?: string | null;
          held_on?: string | null;
          position?: number;
          recording_url?: string | null;
          transcript?: string | null;
          takeaways?: string | null;
          commitments?: string | null;
          recap?: string | null;
          published_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "sessions_project_id_fkey";
            columns: ["project_id"];
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      deliverables: {
        Row: {
          id: string;
          project_id: string;
          session_id: string | null;
          /** Nullable on purpose: a flipchart photo is meaningful without a name. */
          title: string | null;
          /** Which module PRODUCED it. Distinct from stack_layer — see 012. */
          section: string | null;
          /** Optional label on a session photo — "Coffee Shop Questions chart". */
          caption: string | null;
          /** vision_stack: a named, finished artifact. session_image: an untitled photo from a working session. */
          kind: "vision_stack" | "session_image";
          /** Which Vision Stack layer it BELONGS to. References vision_stack_layers.slug. */
          stack_layer: string | null;
          drive_file_id: string | null;
          external_url: string | null;
          /** Supabase Storage object path in the deliverable-images bucket, e.g. "{project_id}/{filename}". */
          image_path: string | null;
          /** Long-form notes on the card — see migration 042. */
          body: string | null;
          /** An uploaded document (usually a PDF) — see migration 014. */
          file_path: string | null;
          file_name: string | null;
          file_mime: string | null;
          file_size: number | null;
          position: number;
          published_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          session_id?: string | null;
          title?: string | null;
          section?: string | null;
          caption?: string | null;
          kind?: "vision_stack" | "session_image";
          stack_layer?: string | null;
          drive_file_id?: string | null;
          external_url?: string | null;
          image_path?: string | null;
          body?: string | null;
          file_path?: string | null;
          file_name?: string | null;
          file_mime?: string | null;
          file_size?: number | null;
          position?: number;
          published_at?: string | null;
          created_at?: string;
        };
        Update: {
          title?: string | null;
          session_id?: string | null;
          section?: string | null;
          caption?: string | null;
          kind?: "vision_stack" | "session_image";
          stack_layer?: string | null;
          drive_file_id?: string | null;
          external_url?: string | null;
          image_path?: string | null;
          body?: string | null;
          file_path?: string | null;
          file_name?: string | null;
          file_mime?: string | null;
          file_size?: number | null;
          position?: number;
          published_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "deliverables_project_id_fkey";
            columns: ["project_id"];
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deliverables_session_id_fkey";
            columns: ["session_id"];
            referencedRelation: "sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      template_resources: {
        Row: {
          id: string;
          template_id: string;
          section: string;
          kind: "handout" | "video" | "exercise" | "team_bio" | "link";
          title: string;
          description: string | null;
          external_url: string | null;
          drive_file_id: string | null;
          /** Marks the combined module handout, which renders large; the rest render small beneath it. */
          is_primary: boolean;
          position: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          template_id: string;
          section: string;
          kind: "handout" | "video" | "exercise" | "team_bio" | "link";
          title: string;
          description?: string | null;
          external_url?: string | null;
          drive_file_id?: string | null;
          is_primary?: boolean;
          position?: number;
          created_at?: string;
        };
        Update: {
          section?: string;
          kind?: "handout" | "video" | "exercise" | "team_bio" | "link";
          title?: string;
          description?: string | null;
          external_url?: string | null;
          drive_file_id?: string | null;
          is_primary?: boolean;
          position?: number;
        };
        Relationships: [
          {
            foreignKeyName: "template_resources_template_id_fkey";
            columns: ["template_id"];
            referencedRelation: "templates";
            referencedColumns: ["id"];
          },
        ];
      };
      section_notes: {
        Row: {
          project_id: string;
          section: string;
          body: string | null;
          updated_at: string;
        };
        Insert: {
          project_id: string;
          section: string;
          body?: string | null;
          updated_at?: string;
        };
        Update: { body?: string | null; updated_at?: string };
        Relationships: [];
      };
      feedback: {
        Row: {
          id: string;
          profile_id: string;
          project_id: string | null;
          kind: "question" | "problem" | "idea";
          message: string;
          from_staff: boolean;
          resolved_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          project_id?: string | null;
          kind?: "question" | "problem" | "idea";
          message: string;
          from_staff?: boolean;
          resolved_at?: string | null;
          created_at?: string;
        };
        Update: { resolved_at?: string | null };
        Relationships: [];
      };
      template_members: {
        Row: {
          template_id: string;
          profile_id: string;
          role: "viewer" | "editor" | "admin";
          org_role: string | null;
          position: number;
        };
        Insert: {
          template_id: string;
          profile_id: string;
          role?: "viewer" | "editor" | "admin";
          org_role?: string | null;
          position?: number;
        };
        Update: { role?: "viewer" | "editor" | "admin"; org_role?: string | null; position?: number };
        Relationships: [];
      };
      template_deliverables: {
        Row: {
          id: string;
          template_id: string;
          title: string;
          section: string | null;
          kind: "vision_stack" | "session_image";
          stack_layer: string | null;
          position: number;
        };
        Insert: {
          id?: string;
          template_id: string;
          title: string;
          section?: string | null;
          kind?: "vision_stack" | "session_image";
          stack_layer?: string | null;
          position?: number;
        };
        Update: {
          title?: string;
          section?: string | null;
          kind?: "vision_stack" | "session_image";
          stack_layer?: string | null;
          position?: number;
        };
        Relationships: [
          {
            foreignKeyName: "template_deliverables_template_id_fkey";
            columns: ["template_id"];
            referencedRelation: "templates";
            referencedColumns: ["id"];
          },
        ];
      };
      /** Audit trail for the GoHighLevel tag webhook. Append-only. */
      ghl_sync_log: {
        Row: {
          id: string;
          ghl_contact_id: string;
          status: string;
          last_synced_at: string | null;
          error_message: string | null;
        };
        Insert: {
          id?: string;
          ghl_contact_id: string;
          status: string;
          last_synced_at?: string | null;
          error_message?: string | null;
        };
        Update: { status?: string; error_message?: string | null };
        Relationships: [];
      };
      /** The training video library. Managed from /admin/videos after the merge. */
      training_videos: {
        Row: {
          id: string;
          title: string;
          url: string;
          description: string | null;
          module: string | null;
          sort_order: number;
          is_published: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          url: string;
          description?: string | null;
          module?: string | null;
          sort_order?: number;
          is_published?: boolean;
          created_by?: string | null;
        };
        Update: {
          title?: string;
          url?: string;
          description?: string | null;
          module?: string | null;
          sort_order?: number;
          is_published?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      /**
       * Who is certified. Was CVF's table and read-only from here; the merge
       * moved its management screens into this app, so this app now owns it.
       * The GoHighLevel webhook and /admin/framers both write it — and both
       * must also set profiles.account_role, or someone gets a login and
       * sees an empty portal.
       */
      certified_framers: {
        Row: {
          id: string;
          email: string;
          name: string;
          ghl_contact_id: string | null;
          is_admin: boolean | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          email: string;
          name: string;
          ghl_contact_id?: string | null;
          is_admin?: boolean | null;
        };
        Update: {
          email?: string;
          name?: string;
          ghl_contact_id?: string | null;
          is_admin?: boolean | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      /** Homework and next steps — see migration 030. */
      project_tasks: {
        Row: {
          id: string;
          project_id: string;
          session_id: string | null;
          section: string | null;
          title: string;
          notes: string | null;
          due_on: string | null;
          is_done: boolean;
          completed_at: string | null;
          position: number;
          created_at: string;
          /** Who owes it — see migration 041. */
          owner: "church" | "runfree";
        };
        Insert: {
          id?: string;
          project_id: string;
          session_id?: string | null;
          section?: string | null;
          title: string;
          notes?: string | null;
          due_on?: string | null;
          is_done?: boolean;
          position?: number;
          owner?: "church" | "runfree";
        };
        Update: {
          title?: string;
          notes?: string | null;
          due_on?: string | null;
          section?: string | null;
          is_done?: boolean;
          position?: number;
          owner?: "church" | "runfree";
        };
        Relationships: [];
      };
      /** The church roster: who is on the team. NOT who can log in. */
      church_contacts: {
        Row: {
          id: string;
          project_id: string;
          full_name: string;
          email: string | null;
          title: string | null;
          position: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          full_name: string;
          email?: string | null;
          title?: string | null;
          position?: number;
          created_at?: string;
        };
        Update: {
          full_name?: string;
          email?: string | null;
          title?: string | null;
          position?: number;
        };
        Relationships: [
          {
            foreignKeyName: "church_contacts_project_id_fkey";
            columns: ["project_id"];
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      /** The prepare buckets a template declares — see migration 022. */
      template_prep_groups: {
        Row: {
          id: string;
          template_id: string;
          /** Which part of the project page this card renders in. */
          section: string;
          key: string;
          title: string;
          description: string | null;
          kind: "dates" | "checklist" | "reading" | "files" | "notes";
          position: number;
        };
        Insert: {
          id?: string;
          template_id: string;
          section: string;
          key: string;
          title: string;
          description?: string | null;
          kind: "dates" | "checklist" | "reading" | "files" | "notes";
          position?: number;
        };
        Update: {
          section?: string;
          title?: string;
          description?: string | null;
          kind?: "dates" | "checklist" | "reading" | "files" | "notes";
          position?: number;
        };
        Relationships: [
          {
            foreignKeyName: "template_prep_groups_template_id_fkey";
            columns: ["template_id"];
            referencedRelation: "templates";
            referencedColumns: ["id"];
          },
        ];
      };
      /** Default rows stamped into each new project of that template. */
      template_prep_items: {
        Row: {
          id: string;
          group_id: string;
          title: string;
          notes: string | null;
          external_url: string | null;
          /** Which Drive file this reading IS. See scripts/seed-prep-reading.ts. */
          drive_file_id: string | null;
          thumb_path: string | null;
          position: number;
        };
        Insert: {
          id?: string;
          group_id: string;
          title: string;
          notes?: string | null;
          external_url?: string | null;
          drive_file_id?: string | null;
          thumb_path?: string | null;
          position?: number;
        };
        Update: {
          title?: string;
          notes?: string | null;
          external_url?: string | null;
          drive_file_id?: string | null;
          thumb_path?: string | null;
          position?: number;
        };
        Relationships: [
          {
            foreignKeyName: "template_prep_items_group_id_fkey";
            columns: ["group_id"];
            referencedRelation: "template_prep_groups";
            referencedColumns: ["id"];
          },
        ];
      };
      /** The Vision Frame as text, one row per element (055). */
      vision_frame: {
        Row: {
          id: string;
          project_id: string;
          element:
            | "problem_statement" | "kingdom_concept" | "mission" | "measures"
            | "strategy" | "values" | "vision_proper";
          body: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          project_id: string;
          element:
            | "problem_statement" | "kingdom_concept" | "mission" | "measures"
            | "strategy" | "values" | "vision_proper";
          body?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          body?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "vision_frame_project_id_fkey";
            columns: ["project_id"];
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      /** Attachments on a module card — however many there are (051). */
      deliverable_files: {
        Row: {
          id: string;
          deliverable_id: string;
          project_id: string;
          path: string;
          name: string;
          mime: string | null;
          size: number | null;
          is_image: boolean;
          position: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          deliverable_id: string;
          project_id: string;
          path: string;
          name: string;
          mime?: string | null;
          size?: number | null;
          is_image?: boolean;
          position?: number;
          created_at?: string;
        };
        Update: {
          name?: string;
          position?: number;
        };
        Relationships: [
          {
            foreignKeyName: "deliverable_files_deliverable_id_fkey";
            columns: ["deliverable_id"];
            referencedRelation: "deliverables";
            referencedColumns: ["id"];
          },
        ];
      };
      /** Resources a coach has highlighted for a church right now (046). */
      project_highlights: {
        Row: {
          id: string;
          project_id: string;
          source_kind: "template_resource" | "handout" | "book" | "deliverable" | "prep_item" | "session" | "upload";
          /** uuid, Drive file id, or null for an upload. */
          source_id: string | null;
          title: string;
          media_kind: "video" | "pdf" | "image" | "link" | "book";
          note: string | null;
          external_url: string | null;
          file_path: string | null;
          file_name: string | null;
          file_mime: string | null;
          file_size: number | null;
          /** Ours, in the deliverable-images bucket. */
          thumb_path: string | null;
          /** Remote — a Loom still or a Drive cover. */
          thumb_url: string | null;
          position: number;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          source_kind: "template_resource" | "handout" | "book" | "deliverable" | "prep_item" | "session" | "upload";
          source_id?: string | null;
          title: string;
          media_kind: "video" | "pdf" | "image" | "link" | "book";
          note?: string | null;
          external_url?: string | null;
          file_path?: string | null;
          file_name?: string | null;
          file_mime?: string | null;
          file_size?: number | null;
          thumb_path?: string | null;
          thumb_url?: string | null;
          position?: number;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          title?: string;
          media_kind?: "video" | "pdf" | "image" | "link" | "book";
          note?: string | null;
          external_url?: string | null;
          file_path?: string | null;
          file_name?: string | null;
          file_mime?: string | null;
          file_size?: number | null;
          thumb_path?: string | null;
          thumb_url?: string | null;
          position?: number;
        };
        Relationships: [
          {
            foreignKeyName: "project_highlights_project_id_fkey";
            columns: ["project_id"];
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      /** The per-project, editable preparation rows. */
      prep_items: {
        Row: {
          id: string;
          project_id: string;
          group_id: string;
          title: string;
          notes: string | null;
          due_on: string | null;
          external_url: string | null;
          /** Storage path in the deliverable-images bucket, {project_id}/prep-*.ext */
          file_path: string | null;
          file_name: string | null;
          file_mime: string | null;
          file_size: number | null;
          is_done: boolean;
          /** Multi-day key dates: an onsite weekend is one row, not three. */
          end_on: string | null;
          /** Zoom/Meet link for a virtual session. */
          meeting_url: string | null;
          /** Hidden from viewers; editors and admins still see it. */
          is_private: boolean;
          /** Page one of file_path, rendered at upload. Nullable: a card
              without one falls back to a glyph. */
          thumb_path: string | null;
          position: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          group_id: string;
          title: string;
          notes?: string | null;
          due_on?: string | null;
          external_url?: string | null;
          file_path?: string | null;
          file_name?: string | null;
          file_mime?: string | null;
          file_size?: number | null;
          is_done?: boolean;
          end_on?: string | null;
          meeting_url?: string | null;
          is_private?: boolean;
          thumb_path?: string | null;
          position?: number;
          created_at?: string;
        };
        Update: {
          title?: string;
          notes?: string | null;
          due_on?: string | null;
          external_url?: string | null;
          file_path?: string | null;
          file_name?: string | null;
          file_mime?: string | null;
          file_size?: number | null;
          is_done?: boolean;
          end_on?: string | null;
          meeting_url?: string | null;
          is_private?: boolean;
          thumb_path?: string | null;
          position?: number;
        };
        Relationships: [
          {
            foreignKeyName: "prep_items_project_id_fkey";
            columns: ["project_id"];
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "prep_items_group_id_fkey";
            columns: ["group_id"];
            referencedRelation: "template_prep_groups";
            referencedColumns: ["id"];
          },
        ];
      };
      vision_stack_layers: {
        Row: {
          slug: string;
          name: string;
          blurb: string | null;
          position: number;
          /** Public path under /brand — null until an icon exists for it. */
          icon_path: string | null;
        };
        Insert: {
          slug: string;
          name: string;
          blurb?: string | null;
          position: number;
        };
        Update: {
          name?: string;
          blurb?: string | null;
          position?: number;
        };
        Relationships: [];
      };
      /**
       * A Foreground Initiative — the 90-day unit of work, carrying the six
       * blocks of Will's Initiative Plan Template plus the Action Step List's
       * header fields (leader, team, start, and the two review dates).
       */
      initiatives: {
        Row: {
          id: string;
          project_id: string;
          name: string;
          initiative: string | null;
          objective: string | null;
          key_deliverables: string | null;
          plan_of_action: string | null;
          timeline: string | null;
          costs: string | null;
          leader: string | null;
          team: string | null;
          start_date: string | null;
          last_review_on: string | null;
          next_review_on: string | null;
          status: "red" | "amber" | "green";
          is_complete: boolean;
          position: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          name: string;
          initiative?: string | null;
          objective?: string | null;
          key_deliverables?: string | null;
          plan_of_action?: string | null;
          timeline?: string | null;
          costs?: string | null;
          leader?: string | null;
          team?: string | null;
          start_date?: string | null;
          last_review_on?: string | null;
          next_review_on?: string | null;
          status?: "red" | "amber" | "green";
          is_complete?: boolean;
          position?: number;
        };
        Update: {
          name?: string;
          initiative?: string | null;
          objective?: string | null;
          key_deliverables?: string | null;
          plan_of_action?: string | null;
          timeline?: string | null;
          costs?: string | null;
          leader?: string | null;
          team?: string | null;
          start_date?: string | null;
          last_review_on?: string | null;
          next_review_on?: string | null;
          status?: "red" | "amber" | "green";
          is_complete?: boolean;
          position?: number;
        };
        Relationships: [
          {
            foreignKeyName: "initiatives_project_id_fkey";
            columns: ["project_id"];
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      /** One row of the Action Step List under an initiative. */
      initiative_steps: {
        Row: {
          id: string;
          initiative_id: string;
          project_id: string;
          description: string;
          status: "red" | "amber" | "green";
          /** "By" — a date on most rows, "Monthly Periodic" on some. */
          by_when: string | null;
          cost: string | null;
          accountable: string | null;
          position: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          initiative_id: string;
          project_id: string;
          description: string;
          status?: "red" | "amber" | "green";
          by_when?: string | null;
          cost?: string | null;
          accountable?: string | null;
          position?: number;
        };
        Update: {
          description?: string;
          status?: "red" | "amber" | "green";
          by_when?: string | null;
          cost?: string | null;
          accountable?: string | null;
          position?: number;
        };
        Relationships: [
          {
            foreignKeyName: "initiative_steps_initiative_id_fkey";
            columns: ["initiative_id"];
            referencedRelation: "initiatives";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "initiative_steps_project_id_fkey";
            columns: ["project_id"];
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      /**
       * A row of the Church Ministry Dashboard. Values are text because the
       * sheet mixes attendance counts, dollars and per-capita giving in one
       * column.
       */
      scoreboard_metrics: {
        Row: {
          id: string;
          project_id: string;
          grouping: "strategy_input" | "measure_output";
          label: string;
          prior_year: string | null;
          current: string | null;
          next_year: string | null;
          trend: "up" | "flat" | "down" | null;
          status: "red" | "amber" | "green" | null;
          position: number;
        };
        Insert: {
          id?: string;
          project_id: string;
          grouping?: "strategy_input" | "measure_output";
          label: string;
          prior_year?: string | null;
          current?: string | null;
          next_year?: string | null;
          trend?: "up" | "flat" | "down" | null;
          status?: "red" | "amber" | "green" | null;
          position?: number;
        };
        Update: {
          grouping?: "strategy_input" | "measure_output";
          label?: string;
          prior_year?: string | null;
          current?: string | null;
          next_year?: string | null;
          trend?: "up" | "flat" | "down" | null;
          status?: "red" | "amber" | "green" | null;
          position?: number;
        };
        Relationships: [
          {
            foreignKeyName: "scoreboard_metrics_project_id_fkey";
            columns: ["project_id"];
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      /**
       * One box of the Horizon Storyline Template. Beyond and Midground have
       * a single box each (position 0); Background has four (0-3). The
       * Foreground band is `initiatives`, not a row here.
       */
      horizon_storyline: {
        Row: {
          id: string;
          project_id: string;
          horizon: "beyond" | "background" | "midground";
          body: string | null;
          position: number;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          horizon: "beyond" | "background" | "midground";
          body?: string | null;
          position?: number;
          updated_at?: string;
        };
        Update: {
          body?: string | null;
          position?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "horizon_storyline_project_id_fkey";
            columns: ["project_id"];
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      /**
       * Ticking a task is the one write a viewer may make, and RLS cannot
       * limit an UPDATE to a single column — see migration 030.
       */
      set_task_done: {
        Args: { p_task_id: string; p_done: boolean };
        Returns: undefined;
      };
      /**
       * Pinning is a personal preference any member may set on their own
       * membership row, but manage_members keeps that table admin-only for
       * UPDATE and RLS cannot limit an UPDATE to one column — see 038.
       */
      set_project_pinned: {
        Args: { p_project_id: string; p_pinned: boolean };
        Returns: undefined;
      };
      /**
       * Stamps profiles.last_seen_at for the caller, at most hourly (056).
       * A function rather than a policy so the throttle lives with the write
       * and update_profiles does not have to widen.
       */
      touch_last_seen: {
        Args: Record<string, never>;
        Returns: undefined;
      };
    };
  };
};
