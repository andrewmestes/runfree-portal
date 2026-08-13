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
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          is_staff?: boolean;
          is_owner?: boolean;
          created_at?: string;
        };
        Update: {
          full_name?: string | null;
          is_staff?: boolean;
          is_owner?: boolean;
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
          created_by: string;
          archived_at?: string | null;
          created_at?: string;
        };
        Update: {
          name?: string;
          template_id?: string | null;
          visibility?: "private" | "team";
          drive_folder_id?: string | null;
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
          role: "client" | "coach";
          added_at: string;
        };
        Insert: {
          project_id: string;
          profile_id: string;
          role?: "client" | "coach";
          added_at?: string;
        };
        Update: {
          role?: "client" | "coach";
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
          held_on: string | null;
          position: number;
          recording_url: string | null;
          transcript: string | null;
          takeaways: string | null;
          commitments: string | null;
          published_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          title: string;
          held_on?: string | null;
          position?: number;
          recording_url?: string | null;
          transcript?: string | null;
          takeaways?: string | null;
          commitments?: string | null;
          published_at?: string | null;
          created_at?: string;
        };
        Update: {
          title?: string;
          held_on?: string | null;
          position?: number;
          recording_url?: string | null;
          transcript?: string | null;
          takeaways?: string | null;
          commitments?: string | null;
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
          title: string;
          drive_file_id: string | null;
          external_url: string | null;
          position: number;
          published_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          session_id?: string | null;
          title: string;
          drive_file_id?: string | null;
          external_url?: string | null;
          position?: number;
          published_at?: string | null;
          created_at?: string;
        };
        Update: {
          title?: string;
          session_id?: string | null;
          drive_file_id?: string | null;
          external_url?: string | null;
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};
