import type { BrandSlug } from "./types.js";

export interface BrandMetadata {
  slug: BrandSlug;
  name: string;
  category: string;
}

export const TASTE_BRANDS: Record<BrandSlug, BrandMetadata> = {
  margiela: { slug: "margiela", name: "Margiela", category: "DRIP" },
  rick_owens: { slug: "rick_owens", name: "Rick Owens", category: "DRIP" },
  raf_simons: { slug: "raf_simons", name: "Raf Simons", category: "DRIP" },
  helmut_lang: { slug: "helmut_lang", name: "Helmut Lang", category: "DRIP" },
  acne: { slug: "acne", name: "Acne", category: "DRIP" },
  ape_leon_dore: { slug: "ape_leon_dore", name: "Aimé Leon Dore", category: "DRIP" },
  carhartt_wip: { slug: "carhartt_wip", name: "Carhartt WIP", category: "DRIP" },
  apc: { slug: "apc", name: "A.P.C.", category: "DRIP" },
  comme_des_garcons: { slug: "comme_des_garcons", name: "Comme des Garçons", category: "DRIP" },
  yohji_yamamoto: { slug: "yohji_yamamoto", name: "Yohji Yamamoto", category: "DRIP" },
  issey_miyake: { slug: "issey_miyake", name: "Issey Miyake", category: "DRIP" },
  apple_pro_display: { slug: "apple_pro_display", name: "Apple Pro Display XDR", category: "SETUPS" },
  herman_miller: { slug: "herman_miller", name: "Herman Miller", category: "SETUPS" },
  steelcase_leap: { slug: "steelcase_leap", name: "Steelcase Leap", category: "SETUPS" },
  hhkb: { slug: "hhkb", name: "HHKB", category: "SETUPS" },
  topre_realforce: { slug: "topre_realforce", name: "Topre Realforce", category: "SETUPS" },
  ducky: { slug: "ducky", name: "Ducky", category: "SETUPS" },
  keychron: { slug: "keychron", name: "Keychron", category: "SETUPS" },
  fellow_kettle: { slug: "fellow_kettle", name: "Fellow Kettle", category: "SETUPS" },
  hario_v60: { slug: "hario_v60", name: "Hario V60", category: "SETUPS" },
  porsche_911: { slug: "porsche_911", name: "Porsche 911", category: "RIDES" },
  mclaren: { slug: "mclaren", name: "McLaren", category: "RIDES" },
  ferrari: { slug: "ferrari", name: "Ferrari", category: "RIDES" },
  bmw_m: { slug: "bmw_m", name: "BMW M", category: "RIDES" },
  bugatti: { slug: "bugatti", name: "Bugatti", category: "RIDES" },
  rogue_fitness: { slug: "rogue_fitness", name: "Rogue Fitness", category: "FITNESS" },
  eleiko: { slug: "eleiko", name: "Eleiko", category: "FITNESS" },
  powerlvl: { slug: "powerlvl", name: "POWERLVL", category: "POWERLVL" },
};
