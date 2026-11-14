export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      ata_itens: {
        Row: {
          ata_id: string
          created_at: string
          descricao: string
          id: string
          preco_total: number | null
          preco_unitario: number
          quantidade: number
          unidade: string
          user_id: string
        }
        Insert: {
          ata_id: string
          created_at?: string
          descricao: string
          id?: string
          preco_total?: number | null
          preco_unitario?: number
          quantidade?: number
          unidade?: string
          user_id?: string
        }
        Update: {
          ata_id?: string
          created_at?: string
          descricao?: string
          id?: string
          preco_total?: number | null
          preco_unitario?: number
          quantidade?: number
          unidade?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ata_itens_ata_id_fkey"
            columns: ["ata_id"]
            isOneToOne: false
            referencedRelation: "atas"
            referencedColumns: ["id"]
          },
        ]
      }
      atas: {
        Row: {
          classificacao_id: string | null
          created_at: string
          data_homologacao: string | null
          data_vencimento: string
          dias_alerta: number
          fornecedor: string | null
          id: string
          numero: string
          objeto: string
          observacoes: string | null
          processo: string | null
          user_id: string
        }
        Insert: {
          classificacao_id?: string | null
          created_at?: string
          data_homologacao?: string | null
          data_vencimento: string
          dias_alerta?: number
          fornecedor?: string | null
          id?: string
          numero: string
          objeto: string
          observacoes?: string | null
          processo?: string | null
          user_id?: string
        }
        Update: {
          classificacao_id?: string | null
          created_at?: string
          data_homologacao?: string | null
          data_vencimento?: string
          dias_alerta?: number
          fornecedor?: string | null
          id?: string
          numero?: string
          objeto?: string
          observacoes?: string | null
          processo?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "atas_classificacao_id_fkey"
            columns: ["classificacao_id"]
            isOneToOne: false
            referencedRelation: "classificacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      classificacoes: {
        Row: {
          created_at: string
          id: string
          nome: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          user_id?: string
        }
        Relationships: []
      }
      contratos: {
        Row: {
          classificacao_id: string | null
          contratado: string | null
          created_at: string
          data_inicio: string | null
          data_vencimento: string
          dias_alerta: number
          id: string
          numero: string
          objeto: string
          observacoes: string | null
          user_id: string
          valor: number | null
        }
        Insert: {
          classificacao_id?: string | null
          contratado?: string | null
          created_at?: string
          data_inicio?: string | null
          data_vencimento: string
          dias_alerta?: number
          id?: string
          numero: string
          objeto: string
          observacoes?: string | null
          user_id?: string
          valor?: number | null
        }
        Update: {
          classificacao_id?: string | null
          contratado?: string | null
          created_at?: string
          data_inicio?: string | null
          data_vencimento?: string
          dias_alerta?: number
          id?: string
          numero?: string
          objeto?: string
          observacoes?: string | null
          user_id?: string
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contratos_classificacao_id_fkey"
            columns: ["classificacao_id"]
            isOneToOne: false
            referencedRelation: "classificacoes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
