<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

- Item import: PDF text is extracted server-side with unpdf (Workers-safe) then structured by the AI gateway in src/lib/importar.functions.ts; spreadsheets are parsed client-side with xlsx (src/lib/planilha.ts).
- Embed the original municipal coat of arms as a shared PNG data URL in src/lib/brasao.ts; this preserves the exact uploaded bytes and includes the image in production bundles without depending on Lovable-specific asset proxy paths on external Worker deployments. Keep the original asset pointer intact.
- Maintain the existing admin-users Edge Function for CPF login and user administration; only login-cpf is public, and all administrative actions validate the caller's session, active profile and protected admin role before using privileged credentials. This preserves the deployed frontend invoke contract without exposing administrative keys.
