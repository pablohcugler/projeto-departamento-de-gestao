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
      adiantamento_nota_documentos: {
        Row: {
          adiantamento_id: string
          arquivo_caminho: string
          arquivo_mime_type: string
          arquivo_nome: string
          arquivo_tamanho_bytes: number
          created_at: string
          id: string
          nota_id: string
          user_id: string
        }
        Insert: {
          adiantamento_id: string
          arquivo_caminho: string
          arquivo_mime_type: string
          arquivo_nome: string
          arquivo_tamanho_bytes: number
          created_at?: string
          id?: string
          nota_id: string
          user_id?: string
        }
        Update: {
          adiantamento_id?: string
          arquivo_caminho?: string
          arquivo_mime_type?: string
          arquivo_nome?: string
          arquivo_tamanho_bytes?: number
          created_at?: string
          id?: string
          nota_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "adiantamento_nota_documentos_adiantamento_id_fkey"
            columns: ["adiantamento_id"]
            isOneToOne: false
            referencedRelation: "adiantamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adiantamento_nota_documentos_nota_id_fkey"
            columns: ["nota_id"]
            isOneToOne: false
            referencedRelation: "adiantamento_notas"
            referencedColumns: ["id"]
          },
        ]
      }
      adiantamento_notas: {
        Row: {
          adiantamento_id: string
          arquivo_caminho: string | null
          arquivo_mime_type: string | null
          arquivo_nome: string | null
          arquivo_tamanho_bytes: number | null
          created_at: string
          data_nota: string
          descricao: string
          fornecedor: string
          id: string
          justificativa: string
          numero_nota: string
          user_id: string
          valor_despesa: number | null
        }
        Insert: {
          adiantamento_id: string
          arquivo_caminho?: string | null
          arquivo_mime_type?: string | null
          arquivo_nome?: string | null
          arquivo_tamanho_bytes?: number | null
          created_at?: string
          data_nota: string
          descricao: string
          fornecedor: string
          id?: string
          justificativa?: string
          numero_nota: string
          user_id?: string
          valor_despesa?: number | null
        }
        Update: {
          adiantamento_id?: string
          arquivo_caminho?: string | null
          arquivo_mime_type?: string | null
          arquivo_nome?: string | null
          arquivo_tamanho_bytes?: number | null
          created_at?: string
          data_nota?: string
          descricao?: string
          fornecedor?: string
          id?: string
          justificativa?: string
          numero_nota?: string
          user_id?: string
          valor_despesa?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "adiantamento_notas_adiantamento_id_fkey"
            columns: ["adiantamento_id"]
            isOneToOne: false
            referencedRelation: "adiantamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      adiantamento_prestacao_arquivos: {
        Row: {
          adiantamento_id: string
          arquivo_caminho: string
          arquivo_mime_type: string
          arquivo_nome: string
          arquivo_tamanho_bytes: number
          created_at: string
          id: string
          nota_id: string | null
          tipo: string
          user_id: string
        }
        Insert: {
          adiantamento_id: string
          arquivo_caminho: string
          arquivo_mime_type?: string
          arquivo_nome: string
          arquivo_tamanho_bytes: number
          created_at?: string
          id?: string
          nota_id?: string | null
          tipo: string
          user_id?: string
        }
        Update: {
          adiantamento_id?: string
          arquivo_caminho?: string
          arquivo_mime_type?: string
          arquivo_nome?: string
          arquivo_tamanho_bytes?: number
          created_at?: string
          id?: string
          nota_id?: string | null
          tipo?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "adiantamento_prestacao_arquivos_adiantamento_id_fkey"
            columns: ["adiantamento_id"]
            isOneToOne: false
            referencedRelation: "adiantamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adiantamento_prestacao_arquivos_nota_id_fkey"
            columns: ["nota_id"]
            isOneToOne: false
            referencedRelation: "adiantamento_notas"
            referencedColumns: ["id"]
          },
        ]
      }
      adiantamento_reaberturas: {
        Row: {
          adiantamento_id: string
          created_at: string
          finalizado_em_anterior: string
          id: string
          reaberto_em: string
          reaberto_por: string
        }
        Insert: {
          adiantamento_id: string
          created_at?: string
          finalizado_em_anterior: string
          id?: string
          reaberto_em?: string
          reaberto_por: string
        }
        Update: {
          adiantamento_id?: string
          created_at?: string
          finalizado_em_anterior?: string
          id?: string
          reaberto_em?: string
          reaberto_por?: string
        }
        Relationships: [
          {
            foreignKeyName: "adiantamento_reaberturas_adiantamento_id_fkey"
            columns: ["adiantamento_id"]
            isOneToOne: false
            referencedRelation: "adiantamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      adiantamentos: {
        Row: {
          created_at: string
          data_recebimento: string
          data_vencimento: string
          finalizado: boolean
          finalizado_em: string | null
          id: string
          numero_empenho: string
          periodo_aplicacao_dias: number
          processo_1doc: string
          setor_id: string
          user_id: string
          valor_recebido: number | null
        }
        Insert: {
          created_at?: string
          data_recebimento: string
          data_vencimento: string
          finalizado?: boolean
          finalizado_em?: string | null
          id?: string
          numero_empenho: string
          periodo_aplicacao_dias: number
          processo_1doc: string
          setor_id?: string
          user_id?: string
          valor_recebido?: number | null
        }
        Update: {
          created_at?: string
          data_recebimento?: string
          data_vencimento?: string
          finalizado?: boolean
          finalizado_em?: string | null
          id?: string
          numero_empenho?: string
          periodo_aplicacao_dias?: number
          processo_1doc?: string
          setor_id?: string
          user_id?: string
          valor_recebido?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "adiantamentos_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      anexos: {
        Row: {
          caminho: string
          created_at: string
          id: string
          nome: string
          ref_id: string
          ref_tipo: string
          tipo_doc: string
          user_id: string
        }
        Insert: {
          caminho: string
          created_at?: string
          id?: string
          nome: string
          ref_id: string
          ref_tipo: string
          tipo_doc: string
          user_id?: string
        }
        Update: {
          caminho?: string
          created_at?: string
          id?: string
          nome?: string
          ref_id?: string
          ref_tipo?: string
          tipo_doc?: string
          user_id?: string
        }
        Relationships: []
      }
      ata_itens: {
        Row: {
          ata_id: string
          codigo_item: string | null
          codigo_produto: string | null
          created_at: string
          descricao: string
          fornecedor: string | null
          id: string
          preco_total: number | null
          preco_unitario: number
          quantidade: number
          saldo_atualizado_em: string | null
          saldo_disponivel: number | null
          unidade: string
          user_id: string
        }
        Insert: {
          ata_id: string
          codigo_item?: string | null
          codigo_produto?: string | null
          created_at?: string
          descricao: string
          fornecedor?: string | null
          id?: string
          preco_total?: number | null
          preco_unitario?: number
          quantidade?: number
          saldo_atualizado_em?: string | null
          saldo_disponivel?: number | null
          unidade?: string
          user_id?: string
        }
        Update: {
          ata_id?: string
          codigo_item?: string | null
          codigo_produto?: string | null
          created_at?: string
          descricao?: string
          fornecedor?: string | null
          id?: string
          preco_total?: number | null
          preco_unitario?: number
          quantidade?: number
          saldo_atualizado_em?: string | null
          saldo_disponivel?: number | null
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
          fase_processo: string | null
          fornecedor: string | null
          id: string
          memorando_1doc: string | null
          numero: string | null
          numero_edital_bll: string | null
          objeto: string
          observacoes: string | null
          pregao: string | null
          processo: string | null
          processo_1doc: string | null
          setor_id: string
          situacao_cadastro: string
          user_id: string
        }
        Insert: {
          classificacao_id?: string | null
          created_at?: string
          data_homologacao?: string | null
          data_vencimento: string
          dias_alerta?: number
          fase_processo?: string | null
          fornecedor?: string | null
          id?: string
          memorando_1doc?: string | null
          numero?: string | null
          numero_edital_bll?: string | null
          objeto: string
          observacoes?: string | null
          pregao?: string | null
          processo?: string | null
          processo_1doc?: string | null
          setor_id?: string
          situacao_cadastro?: string
          user_id?: string
        }
        Update: {
          classificacao_id?: string | null
          created_at?: string
          data_homologacao?: string | null
          data_vencimento?: string
          dias_alerta?: number
          fase_processo?: string | null
          fornecedor?: string | null
          id?: string
          memorando_1doc?: string | null
          numero?: string | null
          numero_edital_bll?: string | null
          objeto?: string
          observacoes?: string | null
          pregao?: string | null
          processo?: string | null
          processo_1doc?: string | null
          setor_id?: string
          situacao_cadastro?: string
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
          {
            foreignKeyName: "atas_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      classificacoes: {
        Row: {
          created_at: string
          id: string
          nome: string
          setor_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          setor_id?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          setor_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "classificacoes_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracoes_sistema: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          chave: string
          valor: Json
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          chave: string
          valor?: Json
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          chave?: string
          valor?: Json
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
          memorando_1doc: string | null
          numero: string
          objeto: string
          observacoes: string | null
          pregao: string | null
          processo_1doc: string | null
          setor_id: string
          situacao_cadastro: string
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
          memorando_1doc?: string | null
          numero: string
          objeto: string
          observacoes?: string | null
          pregao?: string | null
          processo_1doc?: string | null
          setor_id?: string
          situacao_cadastro?: string
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
          memorando_1doc?: string | null
          numero?: string
          objeto?: string
          observacoes?: string | null
          pregao?: string | null
          processo_1doc?: string | null
          setor_id?: string
          situacao_cadastro?: string
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
          {
            foreignKeyName: "contratos_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      feedbacks_sistema: {
        Row: {
          app_version: string
          categoria: string
          created_at: string
          descricao: string
          email_usuario: string | null
          id: string
          nome_usuario: string
          observacao: string | null
          resposta_admin: string | null
          status: string
          titulo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          app_version?: string
          categoria: string
          created_at?: string
          descricao: string
          email_usuario?: string | null
          id?: string
          nome_usuario?: string
          observacao?: string | null
          resposta_admin?: string | null
          status?: string
          titulo: string
          updated_at?: string
          user_id: string
        }
        Update: {
          app_version?: string
          categoria?: string
          created_at?: string
          descricao?: string
          email_usuario?: string | null
          id?: string
          nome_usuario?: string
          observacao?: string | null
          resposta_admin?: string | null
          status?: string
          titulo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pedidos: {
        Row: {
          ata_id: string
          created_at: string
          data_saldo: string
          id: string
          itens: Json
          justificativa: string
          setor_id: string
          total: number
          user_id: string
        }
        Insert: {
          ata_id: string
          created_at?: string
          data_saldo: string
          id?: string
          itens: Json
          justificativa: string
          setor_id: string
          total: number
          user_id?: string
        }
        Update: {
          ata_id?: string
          created_at?: string
          data_saldo?: string
          id?: string
          itens?: Json
          justificativa?: string
          setor_id?: string
          total?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_ata_id_fkey"
            columns: ["ata_id"]
            isOneToOne: false
            referencedRelation: "atas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      setor_permissoes_modulos: {
        Row: {
          id: string
          setor_id: string
          modulo: string
          permitido: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          setor_id: string
          modulo: string
          permitido?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          setor_id?: string
          modulo?: string
          permitido?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "setor_permissoes_modulos_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      setores: {
        Row: {
          acesso_global: boolean
          ativo: boolean
          created_at: string
          id: string
          nome: string
          parent_id: string | null
        }
        Insert: {
          acesso_global?: boolean
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          parent_id?: string | null
        }
        Update: {
          acesso_global?: boolean
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "setores_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          cpf: string | null
          created_at: string
          setor_id: string
          suspenso: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          cpf?: string | null
          created_at?: string
          setor_id: string
          suspenso?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          cpf?: string | null
          created_at?: string
          setor_id?: string
          suspenso?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      atualizar_saldos_ata: {
        Args: { p_ata_id: string; p_data_relatorio: string; p_saldos: Json }
        Returns: number
      }
      current_user_setor_id: { Args: never; Returns: string }
      finalizar_adiantamento: {
        Args: { p_adiantamento_id: string }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_team_member: { Args: { _user_id: string }; Returns: boolean }
      reabrir_adiantamento: {
        Args: { p_adiantamento_id: string }
        Returns: Json
      }
      registrar_cpf_usuario: { Args: { p_cpf: string }; Returns: boolean }
      usuario_ativo: { Args: { p_user_id?: string }; Returns: boolean }
      usuario_pode_acessar_modulo: {
        Args: { p_modulo: string }
        Returns: boolean
      }
      usuario_pode_acessar_adiantamento: {
        Args: { p_adiantamento_id: string }
        Returns: boolean
      }
      usuario_pode_acessar_arquivo_anexo: {
        Args: { p_caminho: string }
        Returns: boolean
      }
      usuario_pode_acessar_referencia: {
        Args: { p_ref_id: string; p_ref_tipo: string }
        Returns: boolean
      }
      usuario_pode_acessar_setor: {
        Args: { p_setor_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
