/**
 * SearchFieldDef → SQL translation (build plan §3/§4: adapters declare filters
 * with an explicit index contract; the CORE translates them — whitelisted
 * targets only, so there is no injection surface and no per-game query code).
 *
 * Targets resolve to Drizzle column objects (compile-time exhaustive over the
 * FieldTarget whitelist) or to validated JSONB paths; every user value is a
 * bound parameter. Unknown params are ignored (pagination etc. live beside
 * filter params); malformed values produce warnings, never SQL.
 *
 * Param value grammar, by field kind:
 *   text        q=lightning
 *   number      mv=3 | mv=lte:3 | mv=gte:2,lte:4
 *   multiselect type=Creature,Instant            (mode comes from the def)
 *   colorset    ci=within:WUG | colors=including:R | ci=exactly:WU
 *               (bare masks default to `within` — the deck-building question)
 */
import { inArray, sql, type Column, type SQL } from "drizzle-orm";

import { cardIdentities } from "@/db/schema";
import { normalizeCardName } from "@/lib/cards/normalize";
import type { FieldTarget, SearchFieldDef } from "@/lib/games/types";

type ColumnName = Extract<FieldTarget, { column: unknown }>["column"];

/** The whitelist made real: every legal target column, and nothing else. */
const COLUMNS: Record<ColumnName, Column> = {
  name_norm: cardIdentities.nameNorm,
  search_text: cardIdentities.searchText,
  primary_type: cardIdentities.primaryType,
  cost_value: cardIdentities.costValue,
  colors_mask: cardIdentities.colorsMask,
  ci_mask: cardIdentities.ciMask,
  cheapest_usd: cardIdentities.cheapestUsd,
  popularity: cardIdentities.popularity,
};

/** W1 U2 B4 R8 G16 C32 — schema-level bit assignments, shared across games. */
const COLOR_BIT: Record<string, number> = { W: 1, U: 2, B: 4, R: 8, G: 16, C: 32 };

const NUMBER_OPS = { eq: "=", lte: "<=", gte: ">=" } as const;
type NumberOp = keyof typeof NUMBER_OPS;

const COLORSET_MODES = ["within", "including", "exactly"] as const;
type ColorsetMode = (typeof COLORSET_MODES)[number];

export interface SearchTranslation {
  conditions: SQL[];
  /** Relevance expression (higher = better) when a ranked text field matched. */
  rank: SQL | null;
  warnings: string[];
}

/** JSONB text access for a validated path (single segment: attrs->>'key'). */
function jsonbText(path: string[]): SQL | null {
  if (!path.length || path.some((seg) => !/^[a-z0-9_]+$/i.test(seg))) return null;
  if (path.length === 1) {
    return sql`${cardIdentities.attrs}->>${sql.raw(`'${path[0]}'`)}`;
  }
  const literal = `'{${path.join(",")}}'`;
  return sql`${cardIdentities.attrs}#>>${sql.raw(literal)}`;
}

function lettersToMask(letters: string): number | null {
  let mask = 0;
  for (const ch of letters.toUpperCase()) {
    const bit = COLOR_BIT[ch];
    if (!bit) return null;
    mask |= bit;
  }
  return mask;
}

export function translateSearch(
  fields: SearchFieldDef[],
  params: Readonly<Record<string, string>>,
): SearchTranslation {
  const conditions: SQL[] = [];
  const warnings: string[] = [];
  let rank: SQL | null = null;

  for (const field of fields) {
    const raw = params[field.key]?.trim();
    if (!raw) continue;

    switch (field.kind) {
      case "text": {
        const column = "column" in field.target ? COLUMNS[field.target.column] : null;
        if (!column) {
          warnings.push(`${field.key}: text fields require a column target`);
          break;
        }
        // name_norm stores app-normalized names; queries must normalize identically.
        const value =
          "column" in field.target && field.target.column === "name_norm"
            ? normalizeCardName(raw)
            : raw;
        if (field.match === "exact") {
          conditions.push(sql`${column} = ${value}`);
        } else if (field.match === "trgm") {
          // Both arms are served by the gin_trgm_ops index; % catches typos.
          conditions.push(sql`(${column} LIKE ${"%" + value + "%"} OR ${column} % ${value})`);
          rank ??= sql`similarity(${column}, ${value})`;
        } else {
          conditions.push(sql`${column} @@ websearch_to_tsquery('english', ${value})`);
          rank ??= sql`ts_rank(${column}, websearch_to_tsquery('english', ${value}))`;
        }
        break;
      }

      case "number": {
        const target =
          "column" in field.target
            ? sql`${COLUMNS[field.target.column]}`
            : jsonbText(field.target.jsonbPath);
        if (!target) {
          warnings.push(`${field.key}: invalid JSONB path`);
          break;
        }
        const numeric = "column" in field.target ? target : sql`(${target})::numeric`;
        for (const part of raw.split(",")) {
          const [opRaw, valueRaw] = part.includes(":") ? part.split(":", 2) : ["eq", part];
          const op = opRaw as NumberOp;
          const value = Number(valueRaw);
          if (!(op in NUMBER_OPS) || !field.ops.includes(op) || !Number.isFinite(value)) {
            warnings.push(`${field.key}: ignored "${part}"`);
            continue;
          }
          conditions.push(sql`${numeric} ${sql.raw(NUMBER_OPS[op])} ${value}`);
        }
        break;
      }

      case "multiselect": {
        const values = raw
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean);
        if (!values.length) break;
        if ("column" in field.target) {
          // 'all' over a scalar column can never match more than one value; treat as any.
          const column = COLUMNS[field.target.column];
          conditions.push(inArray(column, values));
        } else {
          const path = field.target.jsonbPath;
          if (path.length !== 1 || !/^[a-z0-9_]+$/i.test(path[0])) {
            warnings.push(`${field.key}: invalid JSONB path`);
            break;
          }
          // jsonb_path_ops GIN serves @> containment only (schema: ci_attrs_gin).
          const contain = (vals: string[]) =>
            sql`${cardIdentities.attrs} @> ${JSON.stringify({ [path[0]]: vals })}::jsonb`;
          if (field.mode === "all") {
            conditions.push(contain(values));
          } else {
            const ors = values.map((v) => contain([v]));
            conditions.push(sql`(${sql.join(ors, sql` OR `)})`);
          }
        }
        break;
      }

      case "colorset": {
        const column = "column" in field.target ? COLUMNS[field.target.column] : null;
        if (!column) {
          warnings.push(`${field.key}: colorset fields require a column target`);
          break;
        }
        const [modeRaw, lettersRaw] = raw.includes(":") ? raw.split(":", 2) : ["within", raw];
        const mode = modeRaw as ColorsetMode;
        const mask = lettersToMask(lettersRaw);
        if (!COLORSET_MODES.includes(mode) || mask === null) {
          warnings.push(`${field.key}: ignored "${raw}"`);
          break;
        }
        if (mode === "within") {
          // The color-identity fit test: nothing outside the given mask.
          conditions.push(sql`(${column} & ${~mask}) = 0`);
        } else if (mode === "including") {
          conditions.push(sql`(${column} & ${mask}) = ${mask}`);
        } else {
          conditions.push(sql`${column} = ${mask}`);
        }
        break;
      }
    }
  }

  return { conditions, rank, warnings };
}
