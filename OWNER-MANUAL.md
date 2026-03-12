# LOGIC — Manual del Propietario

> Ultima actualizacion: 2026-03-12
> Propietario: Jose Angel Deschamps Vargas
> Estado: Produccion (v1.0.0)

---

## 1. CREDENCIALES Y ACCESOS

### GitHub
- **Repo:** https://github.com/joseandv-creator/logic-concept-engine
- **Token:** Ver `.secrets.md` (archivo local, no se sube a git)
- **Branch principal:** `main`
- **Remote configurado con token** (push directo sin login)

### Supabase (Backend colectivo)
- **Proyecto:** logic
- **URL:** `https://mvropqfconacrexevcsn.supabase.co`
- **Dashboard:** https://supabase.com/dashboard/project/mvropqfconacrexevcsn
- **Anon Key:** Ver `.secrets.md`
- **Service Role Key:** Ver `.secrets.md`
- **Expiracion JWT:** 2088 (no expira en tu vida)

### APIs de LLM (los usuarios ponen las suyas)
- **Anthropic Console:** https://console.anthropic.com/settings/keys
- **OpenAI Platform:** https://platform.openai.com/api-keys
- La extension NO almacena tu key — cada usuario trae la suya

> **IMPORTANTE:** Todas las credenciales estan en `.secrets.md` (local, en .gitignore)

---

## 2. ARQUITECTURA COMPLETA

```
Usuario (Chrome)
  |
  v
[Side Panel UI] ← sidepanel/sidepanel.{html,js,css}
  |
  v
[Service Worker] ← background.js
  |--- importa: system-prompt.js (protocolo)
  |--- importa: lib/validation.js (validacion)
  |--- importa: lib/supabase.js (cliente REST)
  |--- importa: lib/collective.js (logica colectiva)
  |--- importa: lib/providers.js (multi-LLM)
  |--- importa: lib/ranking.js (prioridad)
  |
  |--- API LLM (Anthropic o OpenAI)
  |--- Supabase REST (red colectiva)
  |
[Curator Dashboard] ← curator/{index.html,curator.js,curator.css}
  |--- Conecta a Supabase con Service Role Key
  |--- Detecta convergencias, aprueba, exporta
  |
[Settings] ← options/{options.html,options.js,options.css}
  |--- Proveedor, API key, modelo, red colectiva
```

### Flujo de datos
```
Usuario pregunta → background.js construye prompt →
  + SYSTEM_PROMPT (protocolo)
  + CORRECCIONES (errores corregidos)
  + CONOCIMIENTO COLECTIVO (top 15 por ranking)
→ Provider.chat() → LLM responde → Side Panel muestra

Si el usuario descubre algo (insight):
  → Valida (validation.js)
  → Guarda local (chrome.storage)
  → Si colectiva ON: shareRelationSafe() → Supabase
  → Rate limit check (3/dia)
  → Otros usuarios descubren lo mismo
  → 5+ usuarios + engagement + Jaccard > 0.5
  → Auto-aprobacion → system_update
  → Distribuye a todos los nodos
```

---

## 3. INVENTARIO DE ARCHIVOS

### Nucleo (lo que hace funcionar todo)
| Archivo | Lineas | Funcion |
|---------|--------|---------|
| `system-prompt.js` | 530 | Protocolo Concept Engine completo |
| `background.js` | 357 | Service worker, mensajes, alarms |
| `lib/providers.js` | 170 | Abstraccion Anthropic + OpenAI |
| `lib/ranking.js` | 54 | Scoring: convergencia x temporal x utilidad |
| `lib/validation.js` | 131 | Validacion de insights y niveles |
| `lib/supabase.js` | 137 | Cliente REST para Supabase |
| `lib/collective.js` | 351 | Red colectiva, sync, feedback |

### UI
| Archivo | Lineas | Funcion |
|---------|--------|---------|
| `sidepanel/sidepanel.js` | 927 | Chat, insights, feedback, fronteras |
| `sidepanel/sidepanel.css` | 956 | Estilos del panel |
| `sidepanel/sidepanel.html` | 101 | Estructura del panel |
| `options/options.js` | 170 | Settings multi-proveedor |
| `options/options.html` | 67 | Pagina de configuracion |
| `options/options.css` | 236 | Estilos settings |

### Curator (Admin — solo tu)
| Archivo | Lineas | Funcion |
|---------|--------|---------|
| `curator/curator.js` | 762 | Dashboard completo S1 |
| `curator/curator.css` | 681 | Estilos dashboard |
| `curator/index.html` | 102 | Estructura dashboard |

### Base de datos (SQL — ejecutar en Supabase SQL Editor)
| Archivo | Contenido |
|---------|-----------|
| `supabase-schema.sql` | Tablas base: shared_relations, convergent_relations, system_updates |
| `supabase-schema-v2.sql` | +relation_graph, +refutations, RLS policies |
| `supabase-schema-v3.sql` | +descriptions array, check_convergence() |
| `supabase-schema-v4.sql` | +integration_feedback, get_deprecated_updates(), get_feedback_summary() |
| `supabase-schema-v5.sql` | +check_rate_limit, share_relation_safe, jaccard_words, has_minimum_engagement |
| `supabase-functions-v2.sql` | Funciones RPC: graph_summary, detect_gaps, detect_contradictions |

### Knowledge Base (59 principios en JSON)
| Archivo | Principios |
|---------|-----------|
| `knowledge-base/axiomas.json` | A1-A6 (C=1.0, cerrados) |
| `knowledge-base/postulados.json` | P1-P5 |
| `knowledge-base/limites.json` | L1-L3 |
| `knowledge-base/mapa-generativo.json` | G1-G10 |
| `knowledge-base/reglas-universo.json` | U1-U9 |
| `knowledge-base/reglas-accion-humana.json` | H1-H12 |
| `knowledge-base/leyes-derivadas.json` | LD1-LD3 |
| `knowledge-base/cadena-etica.json` | E1-E4 |
| `knowledge-base/transversales.json` | T1-T3 |
| `knowledge-base/fronteras.json` | F1-F4 (abiertas) |

### Otros
| Archivo | Funcion |
|---------|---------|
| `manifest.json` | Configuracion Chrome Extension (Manifest V3) |
| `content.js` | Inyeccion en paginas web |
| `insights-export.html/js` | Exportar insights como JSON |
| `privacy-policy.html` | Politica de privacidad |
| `docs/index.html` | Landing page (GitHub Pages) |
| `README.md` | Documentacion publica |
| `LICENSE` | MIT |

---

## 4. BASE DE DATOS SUPABASE

### Tablas
| Tabla | Funcion | RLS |
|-------|---------|-----|
| `shared_relations` | Relaciones compartidas por usuarios | anon: insert+select |
| `convergent_relations` | Relaciones verificadas por convergencia | anon: select |
| `system_updates` | Updates distribuidos (versionados) | anon: select |
| `relation_graph` | Grafo de conexiones entre niveles | anon: select |
| `refutations` | Contra-evidencia a updates | anon: insert+select |
| `integration_feedback` | Feedback de utilidad por update | anon: insert+select |

### Funciones RPC (SECURITY DEFINER — ejecutan como admin)
| Funcion | Que hace |
|---------|----------|
| `check_rate_limit(user_hash)` | Verifica < 3 shares en 24h |
| `share_relation_safe(...)` | INSERT con rate limit |
| `has_minimum_engagement(user_hash)` | Requiere 1+ relacion de 7+ dias |
| `jaccard_words(a, b)` | Similaridad de palabras entre dos textos |
| `check_jaccard_similarity(descriptions[], threshold)` | Pairwise Jaccard > umbral |
| `auto_approve_convergent()` | Auto-aprueba si 5+ usuarios + engagement + Jaccard |
| `check_convergence(threshold)` | Detecta convergencias pendientes |
| `get_refutation_counts()` | Cuenta refutaciones por update |
| `get_graph_summary()` | Resumen del grafo de relaciones |
| `get_deprecated_updates(threshold)` | Updates con 3+ refutaciones |
| `get_feedback_summary()` | Resumen de feedback por update |
| `detect_gaps(min_weight)` | Huecos en el grafo (terra incognita) |
| `detect_contradictions()` | Relaciones contradictorias (delta_c opuesto) |

### Restaurar desde cero
Si Supabase muere:
1. Crear nuevo proyecto en supabase.com
2. SQL Editor → ejecutar en orden:
   - `supabase-schema.sql`
   - `supabase-schema-v2.sql`
   - `supabase-functions-v2.sql`
   - `supabase-schema-v3.sql`
   - `supabase-schema-v4.sql`
   - `supabase-schema-v5.sql`
3. Copiar nueva URL + anon key → actualizar en `lib/supabase.js` (SUPABASE_DEFAULTS) y `options/options.js`
4. Curator: importar ultimo snapshot JSON (exportado desde dashboard)

---

## 5. INSTRUCCIONES OPERATIVAS

### Desarrollo diario
```bash
# Ubicacion del proyecto
cd /Users/jose/Desktop/Books/concept-engine-extension

# Recargar extension despues de cambios
# Chrome → chrome://extensions → Logic → boton recarga (flecha circular)

# Ver errores del service worker
# Chrome → chrome://extensions → Logic → "Service Worker" link → Console

# Push cambios
git add <archivos>
git commit -m "descripcion"
git push origin main
```

### Abrir Curator Dashboard
1. Chrome → `chrome-extension://[EXTENSION_ID]/curator/index.html`
2. Pegar Supabase URL + Service Role Key → Conectar
3. Detectar convergencias → Aprobar/rechazar → Exportar snapshot

### Publicar en Chrome Web Store
1. Empaquetar: Chrome → chrome://extensions → "Pack extension"
2. Subir .crx a https://chrome.google.com/webstore/devconsole
3. Privacy policy ya esta en `docs/privacy-policy.html`

### Si cambias de LLM provider
Solo agregar nueva clase en `lib/providers.js`:
```javascript
class NuevoProvider extends BaseProvider {
  getName() { return 'nuevo'; }
  getModels() { return [{ id: '...', name: '...' }]; }
  async chat(messages, systemPrompt, model) { /* fetch al endpoint */ }
  async validateKey(apiKey) { /* test call */ }
}
```
Registrar en `PROVIDERS`, agregar en `options.js` PROVIDER_MODELS y PROVIDER_UI, agregar host en `manifest.json`.

### Si actualizas el protocolo (el-sistema.md)
1. Editar `el-sistema.md`
2. Regenerar `system-prompt.js` (sync de dos nodos)
3. Recargar extension
4. Los cambios al system prompt afectan a TODOS los usuarios al actualizar

### Backup completo
```bash
# Codigo
git push origin main  # ya esta en GitHub

# Base de datos
# Curator Dashboard → Exportar Snapshot → guarda JSON

# O via API:
curl -X POST "https://mvropqfconacrexevcsn.supabase.co/rest/v1/rpc/get_full_snapshot" \
  -H "apikey: [SERVICE_ROLE_KEY]" \
  -H "Authorization: Bearer [SERVICE_ROLE_KEY]" \
  > backup-$(date +%Y%m%d).json
```

### Monitoreo
- **Usuarios activos:** Curator → Estadisticas → node_count en snapshot
- **Convergencias pendientes:** Curator → Detectar (umbral 3-5)
- **Salud del sistema:** Curator → Contradicciones + Refutaciones
- **Feedback loop:** Curator → Feedback de Usuarios (ratio util/no-util)

---

## 6. SISTEMA DE PROTECCIONES

| Proteccion | Mecanismo | Donde |
|-----------|-----------|-------|
| Sybil attack | Rate limit 3/dia + engagement 7 dias | `supabase-schema-v5.sql` |
| Spam de relaciones | Validacion de formato + C values | `lib/validation.js` |
| Convergencia falsa | Jaccard similarity > 0.5 | `check_jaccard_similarity()` |
| Prompt bloat | Max 15 updates inyectados | `lib/ranking.js` |
| Conocimiento malo | Feedback < 30% → democion | `rankAndFilterUpdates()` |
| Refutaciones | 3+ refutaciones → deprecado | `get_deprecated_updates()` |
| API key segura | Solo en chrome.storage local | `options/options.js` |
| Identidad anonima | SHA-256 hash, no reversible | `lib/collective.js` |
| LLM dependency | Multi-provider switchable | `lib/providers.js` |
| DB dependency | Snapshot export/import | Curator dashboard |

---

## 7. NUMEROS CLAVE

| Metrica | Valor |
|---------|-------|
| Lineas de codigo total | ~3,600 JS + ~1,600 CSS + ~400 HTML |
| Archivos JS | 10 |
| Principios en knowledge-base | 59 |
| Schemas SQL | 6 archivos |
| Funciones RPC en Supabase | 13 |
| Max updates en prompt | 15 |
| Rate limit por usuario | 3 relaciones/dia |
| Engagement minimo | 7 dias |
| Jaccard threshold | 0.5 |
| Convergencia minima | 5 usuarios |
| Max tokens por request | 4,096 |
| Alarm interval | 360 minutos (6 horas) |

---

## 8. HISTORIAL DE VERSIONES

| Commit | Cambio |
|--------|--------|
| `128d34c` | Multi-provider + ranking + anti-gaming |
| `ee59d90` | 6 mejoras de robustez (feedback, deprecacion, gaps, auto-approve) |
| `541ccc6` | Fix pipeline convergencia |
| `8be080d` | Validacion + persistencia distribuida |
| `ef63514` | Inteligencia colectiva v2 (grafo, refutaciones, gaps) |
| `78a1f3e` | Remove content_scripts warning |
| `9d9a1a4` | Narrow host_permissions |
| `ad19cc1` | Remove unused downloads permission |

---

## 9. CONTACTO Y RECOVERY

Si pierdes todo:
1. **Codigo:** `git clone https://github.com/joseandv-creator/logic-concept-engine.git`
2. **Base de datos:** Crear nuevo Supabase → ejecutar 6 SQL files en orden → importar ultimo snapshot
3. **Extension:** Cargar como "unpacked" en chrome://extensions
4. **Este manual:** Esta en el repo como `OWNER-MANUAL.md`

Si pierdes acceso a GitHub:
- El codigo esta local en `/Users/jose/Desktop/Books/concept-engine-extension/`
- Crear nuevo repo y push

Si pierdes acceso a Supabase:
- Ultimo snapshot esta en chrome.storage (Curator → Exportar)
- Crear nuevo proyecto → ejecutar SQLs → importar snapshot
- Actualizar URLs en `lib/supabase.js` y `options/options.js`
