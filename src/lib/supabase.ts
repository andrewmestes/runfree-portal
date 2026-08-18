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
        };
        Insert: {
          project_id: string;
          profile_id: string;
          role?: "viewer" | "editor" | "admin";
          org_role?: string | null;
          is_lead?: boolean;
          added_at?: string;
        };
        Update: {
          role?: "viewer" | "editor" | "admin";
          org_role?: string | null;
          is_lead?: boolean;
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
      /**
       * CVF's table, read-only from this app. Declared so the merged admin
       * can show who is certified alongside who is on a project — the two
       * portals answered "who is this person?" separately and nothing showed
       * both at once. Never written from here; the CVF app owns it.
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
        Insert: never;
        Update: never;
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
        };
        Update: {
          title?: string;
          notes?: string | null;
          due_on?: string | null;
          section?: string | null;
          is_done?: boolean;
          position?: number;
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
          position: number;
        };
        Insert: {
          id?: string;
          group_id: string;
          title: string;
          notes?: string | null;
          external_url?: string | null;
          position?: number;
        };
        Update: {
          title?: string;
          notes?: string | null;
          external_url?: string | null;
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
    };
  };
};
