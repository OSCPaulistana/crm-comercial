"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { geoMercator, geoPath, type GeoPermissibleObjects } from "d3-geo";
import { Home, Minus, Plus } from "lucide-react";
import { CHART_PRIMARY } from "@/lib/constants";
import { formatBRL, formatNumber } from "@/lib/format";

/** Cidade com negócios fechados. `lng`/`lat` ausentes = sem localização no mapa (só entra no ranking). */
export interface CidadeNegocio {
  key: string;
  nome: string;
  uf: string;
  qtd: number;
  valor: number;
  lng?: number;
  lat?: number;
}

interface UfFeature {
  type: "Feature";
  geometry: GeoPermissibleObjects;
  properties: { codarea: string };
}
interface UfCollection {
  type: "FeatureCollection";
  features: UfFeature[];
}

/** Código IBGE da UF → sigla. */
const UF_SIGLA: Record<string, string> = {
  "11": "RO", "12": "AC", "13": "AM", "14": "RR", "15": "PA", "16": "AP", "17": "TO",
  "21": "MA", "22": "PI", "23": "CE", "24": "RN", "25": "PB", "26": "PE", "27": "AL", "28": "SE", "29": "BA",
  "31": "MG", "32": "ES", "33": "RJ", "35": "SP",
  "41": "PR", "42": "SC", "43": "RS",
  "50": "MS", "51": "MT", "52": "GO", "53": "DF",
};

const W = 760;
const H = 620;
const K_MAX = 60;
/** A partir deste zoom, o nome das cidades aparece ao lado do ponto. */
const K_NOMES = 3;

interface View {
  k: number;
  x: number;
  y: number;
}
const VIEW_INICIAL: View = { k: 1, x: 0, y: 0 };

/** Mantém o mapa ocupando a área visível. */
function limitar(v: View): View {
  const k = Math.min(K_MAX, Math.max(1, v.k));
  return { k, x: Math.min(0, Math.max(W - W * k, v.x)), y: Math.min(0, Math.max(H - H * k, v.y)) };
}

/** Mapa do Brasil (estados) com um ponto por cidade que teve negócio fechado. Zoom pela roda do mouse; arraste para mover. */
export function MapaNegocios({ cidades, semLocalizacao }: { cidades: CidadeNegocio[]; semLocalizacao: number }) {
  const [geo, setGeo] = useState<UfCollection | null>(null);
  const [erro, setErro] = useState(false);
  const [view, setView] = useState<View>(VIEW_INICIAL);
  const [hover, setHover] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const arrasto = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch("/geo/brasil-uf.json")
      .then((r) => (r.ok ? (r.json() as Promise<UfCollection>) : Promise.reject()))
      .then((g) => vivo && setGeo(g))
      .catch(() => vivo && setErro(true));
    return () => {
      vivo = false;
    };
  }, []);

  const { projecao, estados } = useMemo(() => {
    if (!geo) return { projecao: null, estados: [] as { cod: string; d: string; centro: [number, number] }[] };
    const proj = geoMercator().fitExtent(
      [
        [8, 8],
        [W - 8, H - 8],
      ],
      geo as unknown as GeoPermissibleObjects,
    );
    const path = geoPath(proj);
    return {
      projecao: proj,
      estados: geo.features.map((f) => ({
        cod: f.properties.codarea,
        d: path(f.geometry) ?? "",
        centro: path.centroid(f.geometry) as [number, number],
      })),
    };
  }, [geo]);

  const ufsComNegocio = useMemo(() => new Set(cidades.map((c) => c.uf)), [cidades]);
  const pontos = useMemo(() => {
    if (!projecao) return [];
    return cidades
      .filter((c) => c.lng !== undefined && c.lat !== undefined)
      .map((c) => {
        const p = projecao([c.lng!, c.lat!]);
        return p ? { ...c, px: p[0], py: p[1] } : null;
      })
      .filter((p): p is CidadeNegocio & { px: number; py: number } => p !== null)
      .sort((a, b) => b.qtd - a.qtd);
  }, [cidades, projecao]);
  const maxQtd = Math.max(1, ...pontos.map((p) => p.qtd));

  const zoomEm = useCallback((px: number, py: number, fator: number) => {
    setView((v) => {
      const k = Math.min(K_MAX, Math.max(1, v.k * fator));
      const r = k / v.k;
      return limitar({ k, x: px - (px - v.x) * r, y: py - (py - v.y) * r });
    });
  }, []);

  /** Posição do ponteiro em unidades do viewBox. */
  const posicao = (clientX: number, clientY: number) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: ((clientX - rect.left) * W) / rect.width, y: ((clientY - rect.top) * H) / rect.height, escala: W / rect.width };
  };

  // a roda precisa de listener não passivo para impedir a rolagem da página enquanto se dá zoom
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = posicao(e.clientX, e.clientY);
      zoomEm(p.x, p.y, Math.exp(-e.deltaY * 0.0018));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomEm, geo]);

  const botaoZoom = (fator: number) => zoomEm(W / 2, H / 2, fator);
  const emFoco = pontos.find((p) => p.key === hover);

  if (erro) {
    return <div className="flex h-[420px] items-center justify-center text-sm text-fg-3">Não foi possível carregar o mapa.</div>;
  }
  if (!geo) {
    return <div className="flex h-[420px] animate-pulse items-center justify-center rounded-md bg-gray-50 text-sm text-fg-3">Carregando mapa...</div>;
  }

  return (
    <div>
      <div className="relative overflow-hidden rounded-md border border-line bg-[#f8fafc]">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Mapa do Brasil com um ponto em cada cidade que teve negócio fechado"
          className="block h-auto w-full cursor-grab touch-none select-none active:cursor-grabbing"
          onPointerDown={(e) => {
            const p = posicao(e.clientX, e.clientY);
            arrasto.current = { x: p.x, y: p.y };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!arrasto.current) return;
            const p = posicao(e.clientX, e.clientY);
            const dx = p.x - arrasto.current.x;
            const dy = p.y - arrasto.current.y;
            arrasto.current = { x: p.x, y: p.y };
            setView((v) => limitar({ ...v, x: v.x + dx, y: v.y + dy }));
          }}
          onPointerUp={() => (arrasto.current = null)}
          onPointerCancel={() => (arrasto.current = null)}
          onDoubleClick={(e) => {
            const p = posicao(e.clientX, e.clientY);
            zoomEm(p.x, p.y, 2);
          }}
        >
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            {estados.map((s) => {
              const sigla = UF_SIGLA[s.cod] ?? "";
              const ativo = ufsComNegocio.has(sigla);
              return (
                <path
                  key={s.cod}
                  d={s.d}
                  fill={ativo ? "#dbeafe" : "#eef0f3"}
                  stroke={ativo ? "#93c5fd" : "#cfd4dc"}
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                  strokeLinejoin="round"
                />
              );
            })}
          </g>

          {/* siglas dos estados (tamanho fixo na tela) */}
          {view.k < 8 &&
            estados.map((s) => {
              const sigla = UF_SIGLA[s.cod];
              if (!sigla || !Number.isFinite(s.centro[0])) return null;
              return (
                <text
                  key={`uf-${s.cod}`}
                  x={s.centro[0] * view.k + view.x}
                  y={s.centro[1] * view.k + view.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={11}
                  fill="#8b93a1"
                  className="pointer-events-none"
                >
                  {sigla}
                </text>
              );
            })}

          {/* pontos das cidades (tamanho fixo na tela) */}
          {pontos.map((p) => {
            const cx = p.px * view.k + view.x;
            const cy = p.py * view.k + view.y;
            if (cx < -30 || cx > W + 30 || cy < -30 || cy > H + 30) return null;
            const r = 11 + 9 * Math.sqrt(p.qtd / maxQtd);
            return (
              <g
                key={p.key}
                onPointerEnter={() => setHover(p.key)}
                onPointerLeave={() => setHover((h) => (h === p.key ? null : h))}
                onPointerDown={(e) => e.stopPropagation()}
                className="cursor-pointer"
              >
                <circle cx={cx} cy={cy} r={r} fill={CHART_PRIMARY} fillOpacity={0.9} stroke="#fff" strokeWidth={2} />
                <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={700} fill="#fff" className="pointer-events-none">
                  {p.qtd}
                </text>
                {view.k >= K_NOMES && (
                  <text
                    x={cx + r + 5}
                    y={cy}
                    dominantBaseline="central"
                    fontSize={12}
                    fontWeight={600}
                    fill="#111827"
                    stroke="#fff"
                    strokeWidth={3}
                    paintOrder="stroke"
                    className="pointer-events-none"
                  >
                    {p.nome}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {emFoco && (
          <div
            className="pointer-events-none absolute z-10 min-w-40 -translate-x-1/2 -translate-y-full rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-pop"
            style={{
              left: `${((emFoco.px * view.k + view.x) / W) * 100}%`,
              top: `${((emFoco.py * view.k + view.y - 24) / H) * 100}%`,
            }}
          >
            <p className="font-semibold text-fg">
              {emFoco.nome}/{emFoco.uf}
            </p>
            <p className="mt-0.5 text-fg-2">
              {formatNumber(emFoco.qtd)} negócio{emFoco.qtd === 1 ? "" : "s"} fechado{emFoco.qtd === 1 ? "" : "s"}
            </p>
            <p className="text-fg-2">
              Faturado <span className="font-medium text-fg tabular-nums">{formatBRL(emFoco.valor)}</span>
            </p>
          </div>
        )}

        <div className="absolute top-2 right-2 flex flex-col gap-1">
          {[
            { rotulo: "Aproximar", icone: <Plus className="size-4" />, acao: () => botaoZoom(1.6) },
            { rotulo: "Afastar", icone: <Minus className="size-4" />, acao: () => botaoZoom(1 / 1.6) },
            { rotulo: "Voltar ao Brasil inteiro", icone: <Home className="size-4" />, acao: () => setView(VIEW_INICIAL) },
          ].map((b) => (
            <button
              key={b.rotulo}
              type="button"
              onClick={b.acao}
              aria-label={b.rotulo}
              title={b.rotulo}
              className="flex size-8 items-center justify-center rounded-md border border-line bg-surface text-fg-2 shadow-sm hover:bg-gray-50 hover:text-fg"
            >
              {b.icone}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-2 text-xs text-fg-3">
        Use a roda do mouse para ampliar (os nomes das cidades aparecem ao aproximar) e arraste para mover.
        {semLocalizacao > 0 &&
          ` ${formatNumber(semLocalizacao)} negócio${semLocalizacao === 1 ? "" : "s"} sem município/localização ${semLocalizacao === 1 ? "não aparece" : "não aparecem"} no mapa.`}
      </p>
    </div>
  );
}

/** Todas as cidades com negócio fechado, por quantidade (desempate pelo valor). A lista rola quando é longa. */
export function RankingCidades({ cidades }: { cidades: CidadeNegocio[] }) {
  if (cidades.length === 0) {
    return <div className="flex h-[200px] items-center justify-center text-sm text-fg-3">Nenhum negócio fechado no período.</div>;
  }
  const max = Math.max(...cidades.map((c) => c.qtd));
  return (
    <ol className="max-h-[540px] space-y-4 overflow-y-auto pr-2">
      {cidades.map((c, i) => (
        <li key={c.key}>
          <div className="flex items-center gap-3">
            <span
              className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums ${i === 0 ? "bg-accent text-white" : "bg-gray-100 text-fg-2"}`}
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium text-fg">
                  {c.nome}
                  <span className="font-normal text-fg-2">/{c.uf}</span>
                </span>
                <span className="shrink-0 text-sm font-semibold text-fg tabular-nums">
                  {formatNumber(c.qtd)} <span className="text-xs font-normal text-fg-2">negócio{c.qtd === 1 ? "" : "s"}</span>
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-accent" style={{ width: `${(c.qtd / max) * 100}%` }} />
              </div>
              <p className="mt-1 text-xs text-fg-2 tabular-nums">Faturado {formatBRL(c.valor)}</p>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
